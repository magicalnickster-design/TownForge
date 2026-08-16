import { ANNOUNCE_TRADES_SETTING, FLAGS, LOG_PREFIX, MODULE_ID } from "./constants.js";
import {
  addCopper as addCopperPure,
  currencyToCopper as currencyToCopperPure,
  deductCopper as deductCopperPure,
  formatCopper,
  formatWallet,
  SELL_PRICE_RATIO,
  validatePurchaseRequest
} from "./shop-currency.js";
import {
  COIN_CP,
  ECONOMY_TIERS,
  INVENTORY_MODES,
  OCCUPATION_SHOP_MAP,
  PARTY_LEVEL_MODES,
  SHOP_FILTERS,
  SHOP_TYPES,
  SHOPKEEPER_FLAG,
  defaultShopkeeperFlags,
  isUnlimitedStock,
  sanitizeStockEntry
} from "./shop-constants.js";
import { resolveSelectedItemPacks } from "./shop-sources.js";
import { refreshOpenShopUIs } from "./shop-sync.js";
import { newGenerationSalt, randomPick, seededPick, stableHash, weightedRandomPick, weightedSeededPick } from "./shop-random.js";
import {
  buildPartyProfile,
  detectAssignedPartyActors,
  formatPartyClassBanner,
  normalizePartyAwareSettings,
  partyProfileFingerprint,
  PARTY_DETECTION_MODES,
  resolveManualPartyActors,
  scoreItemPartyWeight
} from "./shop-party.js";

/**
 * TownForge shop generation, pricing, and purchase validation.
 *
 * Purchase security:
 * - Prices/stock are always read from Actor flags on the merchant
 * - Clients cannot invent stock entries or override prices
 * - Shop configuration mutations require GM permissions
 * - Player purchases are fulfilled by an active GM when possible
 */
export class ShopService {
  /** @type {Map<string, object[]>} */
  #packIndexCache = new Map();

  /** @type {Set<string>} */
  #purchaseLocks = new Set();

  /** @type {Map<string, {resolve: Function, timeout: any}>} */
  #pendingPurchases = new Map();

  /** @type {Map<string, {description: string, loadedAt: number}>} */
  #detailCache = new Map();

  /**
   * @param {Actor} actor
   * @returns {object}
   */
  getShopkeeper(actor) {
    const raw = actor?.getFlag?.(MODULE_ID, SHOPKEEPER_FLAG);
    if (!raw || typeof raw !== "object") return defaultShopkeeperFlags();
    const shop = defaultShopkeeperFlags(raw);
    shop.stockCount = Math.max(1, Math.min(100, Math.floor(Number(shop.stockCount) || 25)));
    shop.inventory = this.#sanitizeInventory(shop.inventory);
    return shop;
  }

  /**
   * @param {Actor} actor
   * @param {object} patch
   * @param {{allowNonGM?: boolean}} [options]
   * @returns {Promise<object>}
   */
  async updateShopkeeper(actor, patch, options = {}) {
    if (!actor) throw new Error("Missing merchant actor");
    const isOwner = Boolean(actor.isOwner);
    if (!game.user?.isGM && !isOwner && !options.allowNonGM) {
      throw new Error("Only the GM can modify TownForge shopkeeper settings.");
    }
    // Non-GM clients may only mutate inventory (instant BG3-style trades).
    if (!game.user?.isGM) {
      const keys = Object.keys(patch ?? {});
      if (!keys.length || keys.some((key) => key !== "inventory")) {
        throw new Error("Only the GM can modify TownForge shopkeeper settings.");
      }
    }
    const current = this.getShopkeeper(actor);
    const next = foundry.utils.mergeObject(current, patch, { inplace: false });
    next.priceMultiplier = Math.max(0.1, Number(next.priceMultiplier) || 1);
    next.stockCount = Math.max(1, Math.min(100, Math.floor(Number(next.stockCount) || 25)));
    if (next.fixedPartyLevel != null) {
      next.fixedPartyLevel = Math.max(1, Math.min(20, Number(next.fixedPartyLevel) || 1));
    }
    // Always replace inventory by assignment. Foundry setFlag/mergeObject otherwise
    // merges arrays by index and can preserve prior stock/order across regenerates.
    if (Object.prototype.hasOwnProperty.call(patch, "inventory")) {
      next.inventory = this.#sanitizeInventory(
        Array.isArray(patch.inventory) ? patch.inventory.slice() : []
      );
    } else if (!Array.isArray(next.inventory)) {
      next.inventory = [];
    } else {
      next.inventory = this.#sanitizeInventory(next.inventory);
    }

    const partyAware = normalizePartyAwareSettings({
      ...next,
      partyActorUuids: Object.prototype.hasOwnProperty.call(patch, "partyActorUuids")
        ? patch.partyActorUuids
        : next.partyActorUuids
    });
    next.partyAwareInventory = partyAware.partyAwareInventory;
    next.partyDetectionMode = partyAware.partyDetectionMode;
    next.partyActorUuids = partyAware.partyActorUuids;

    // Inventory-only writes (player trades) must not touch sibling shop fields.
    const inventoryOnly =
      !game.user?.isGM &&
      Object.keys(patch ?? {}).length === 1 &&
      Object.prototype.hasOwnProperty.call(patch, "inventory");
    if (inventoryOnly) {
      await this.#writeShopkeeperInventory(actor, next.inventory);
    } else {
      await this.#writeShopkeeperFlag(actor, next);
    }

    // Guard: a wiped flag would look like a disabled empty shop.
    const written = this.getShopkeeper(actor);
    if (next.enabled && !written.enabled) {
      console.error(
        `${LOG_PREFIX} Shopkeeper flag lost enabled state after write on ${actor.name}. Restoring.`
      );
      await actor.update({
        [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}.enabled`]: true,
        [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}.shopType`]: next.shopType,
        [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}.shopName`]: next.shopName,
        [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}.inventoryMode`]: next.inventoryMode,
        [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}.economyTier`]: next.economyTier,
        [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}.partyLevelMode`]: next.partyLevelMode,
        [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}.fixedPartyLevel`]: next.fixedPartyLevel,
        [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}.priceMultiplier`]: next.priceMultiplier,
        [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}.generationKey`]: next.generationKey,
        [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}.generatedAt`]: next.generatedAt,
        [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}.-=inventory`]: null,
        [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}.inventory`]: Array.isArray(next.inventory)
          ? next.inventory.slice()
          : []
      });
    }

    if (next.enabled) {
      await this.ensurePlayerShopAccess(actor);
    }
    // Local clients refresh immediately; remote clients also get updateActor + socket.
    refreshOpenShopUIs(actor, { immediate: true });
    this.#broadcastShopInventoryChanged(actor);
    return this.getShopkeeper(actor);
  }

  /**
   * Persist shopkeeper flags without wiping the parent flag object.
   * IMPORTANT: Never use `flags.townforge.-=shopkeeper` in the same update as a
   * re-set. Foundry can apply the deletion after the write (or reject the write
   * for non-GM owners), which clears `enabled` and makes the shop disappear
   * after a player trade. Only the inventory array is cleared+replaced.
   * Never persist quantity:null — Foundry treats null as delete and can drop stock.
   * @param {Actor} actor
   * @param {object} next
   */
  async #writeShopkeeperFlag(actor, next) {
    const base = `flags.${MODULE_ID}.${SHOPKEEPER_FLAG}`;
    const inventory = this.#sanitizeInventory(next.inventory);
    const update = {
      [`${base}.-=inventory`]: null,
      [`${base}.inventory`]: inventory
    };
    for (const [key, value] of Object.entries(next)) {
      if (key === "inventory") continue;
      // Skip null sibling values — Foundry deletes keys set to null.
      if (value === null) continue;
      update[`${base}.${key}`] = value;
    }
    await actor.update(update);
  }

  /**
   * Inventory-only flag write used by player trades.
   * @param {Actor} actor
   * @param {object[]} inventory
   */
  async #writeShopkeeperInventory(actor, inventory) {
    const base = `flags.${MODULE_ID}.${SHOPKEEPER_FLAG}`;
    const clean = this.#sanitizeInventory(inventory);
    await actor.update({
      [`${base}.-=inventory`]: null,
      [`${base}.inventory`]: clean
    });
  }

  /**
   * @param {object[]} inventory
   * @returns {object[]}
   */
  #sanitizeInventory(inventory) {
    return (Array.isArray(inventory) ? inventory : [])
      .filter((entry) => entry?.id && entry?.uuid && entry?.name)
      .map((entry) => sanitizeStockEntry(entry));
  }

  /**
   * @param {object} entry
   * @returns {boolean}
   */
  #isUnlimited(entry) {
    return isUnlimitedStock(entry);
  }

  /**
   * Infer a shop type from occupation / name text.
   * @param {string} occupation
   * @returns {string}
   */
  inferShopType(occupation = "") {
    const text = String(occupation).toLowerCase();
    for (const entry of OCCUPATION_SHOP_MAP) {
      if (entry.keywords.some((keyword) => text.includes(keyword))) return entry.shopType;
    }
    return "general-store";
  }

  /**
   * Build occupation/name text used for shop-type inference.
   * @param {Actor} actor
   * @returns {string}
   */
  getOccupationHint(actor) {
    return [
      actor?.getFlag?.(MODULE_ID, FLAGS.OCCUPATION),
      actor?.system?.details?.occupation,
      actor?.name
    ]
      .filter(Boolean)
      .join(" ");
  }

  /**
   * Average level of player-owned character Actors.
   * @returns {number}
   */
  detectPartyLevel() {
    const pcs = (game.actors?.contents ?? []).filter(
      (actor) =>
        actor.type === "character" &&
        actor.hasPlayerOwner &&
        !actor.getFlag?.(MODULE_ID, FLAGS.NPC_ID)
    );

    const levels = pcs
      .map((actor) => Number(actor.system?.details?.level ?? actor.system?.details?.xp?.level ?? 0))
      .filter((level) => Number.isFinite(level) && level > 0);

    if (!levels.length) return 1;
    const avg = levels.reduce((sum, level) => sum + level, 0) / levels.length;
    return Math.max(1, Math.min(20, Math.round(avg)));
  }

  /**
   * @param {object} shop
   * @returns {number}
   */
  getEffectivePartyLevel(shop) {
    if (shop.partyLevelMode === PARTY_LEVEL_MODES.fixed) {
      return Math.max(1, Math.min(20, Number(shop.fixedPartyLevel) || 1));
    }
    return this.detectPartyLevel();
  }

  /**
   * Resolve the party used by Party-Aware Inventory (assigned PCs or manual list).
   * @param {object} shop
   * @returns {Promise<{
   *   profile: ReturnType<typeof buildPartyProfile>,
   *   missingUuids: string[],
   *   detectionMode: string,
   *   enabled: boolean
   * }>}
   */
  async resolvePartyAwareContext(shop) {
    const settings = normalizePartyAwareSettings(shop);
    if (!settings.partyAwareInventory) {
      return {
        enabled: false,
        detectionMode: settings.partyDetectionMode,
        missingUuids: [],
        profile: buildPartyProfile([])
      };
    }

    let actors = [];
    let missingUuids = [];
    if (settings.partyDetectionMode === PARTY_DETECTION_MODES.manual) {
      const resolved = await resolveManualPartyActors(settings.partyActorUuids, (uuid) => fromUuid(uuid));
      actors = resolved.actors;
      missingUuids = resolved.missing;
    } else {
      actors = detectAssignedPartyActors(game.users?.contents ?? game.users ?? [], (ref) => {
        if (!ref) return null;
        if (typeof ref === "object" && ref.type === "character") return ref;
        const id = typeof ref === "string" ? ref : ref.uuid || ref.id;
        return (game.actors?.contents ?? []).find((actor) => actor.uuid === id || actor.id === id) ?? null;
      });
    }

    return {
      enabled: true,
      detectionMode: settings.partyDetectionMode,
      missingUuids,
      profile: buildPartyProfile(actors)
    };
  }

  /**
   * UI helper: party-aware summary for the Shopkeeper config window.
   * @param {object} shop
   * @returns {Promise<object>}
   */
  async getPartyAwareUiState(shop) {
    const settings = normalizePartyAwareSettings(shop);
    const context = await this.resolvePartyAwareContext(shop);
    const characterActors = (game.actors?.contents ?? [])
      .filter((actor) => actor.type === "character")
      .map((actor) => ({
        uuid: actor.uuid,
        id: actor.id,
        name: actor.name,
        selected: settings.partyActorUuids.includes(actor.uuid) || settings.partyActorUuids.includes(actor.id)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      ...settings,
      profile: context.profile,
      missingUuids: context.missingUuids,
      banner: formatPartyClassBanner(context.profile),
      memberLines: (context.profile.members ?? []).map((member) => {
        const classLabel = member.classes.length
          ? member.classes.map((row) => `${row.name} ${row.levels}`).join(" / ")
          : `Level ${member.totalLevel}`;
        return { name: member.name, detail: classLabel };
      }),
      detectedCount: context.profile.members.length,
      characterActors,
      fallbackWarning: Boolean(settings.partyAwareInventory && context.profile.empty)
    };
  }

  /**
   * Clear cached item indexes (e.g. after source setting changes).
   */
  clearItemIndexCache() {
    this.#packIndexCache.clear();
  }

  /**
   * Enable shopkeeper and generate automatic inventory when needed.
   * @param {Actor} actor
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async enableShopkeeper(actor, options = {}) {
    if (!game.user?.isGM) throw new Error("Only the GM can enable shopkeepers.");
    const current = this.getShopkeeper(actor);
    const shopType =
      options.shopType ||
      current.shopType ||
      this.inferShopType(this.getOccupationHint(actor)) ||
      "general-store";

    const enabled = await this.updateShopkeeper(actor, {
      enabled: true,
      shopType,
      shopName: options.shopName || current.shopName || `${actor.name}'s Shop`,
      inventoryMode: options.inventoryMode || current.inventoryMode || INVENTORY_MODES.automatic,
      economyTier: options.economyTier || current.economyTier || "standard",
      partyLevelMode: options.partyLevelMode || current.partyLevelMode || PARTY_LEVEL_MODES.auto,
      fixedPartyLevel: options.fixedPartyLevel ?? current.fixedPartyLevel,
      priceMultiplier: options.priceMultiplier ?? current.priceMultiplier ?? 1
    });

    // Players need at least OBSERVER to read live shop inventory flags.
    await this.ensurePlayerShopAccess(actor);

    if (enabled.inventoryMode === INVENTORY_MODES.automatic) {
      return this.regenerateInventory(actor, { force: true });
    }
    return enabled;
  }

  /**
   * Ensure default ownership is OWNER so players can browse stock and complete
   * instant BG3-style trades (update inventory flags) without waiting on a GM.
   * Double-click still opens the TownForge merchant UI, not the NPC sheet.
   * @param {Actor} actor
   */
  async ensurePlayerShopAccess(actor) {
    if (!game.user?.isGM || !actor) return;
    try {
      const OWNER =
        CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ??
        CONST?.DOCUMENT_PERMISSION_LEVELS?.OWNER ??
        3;
      const currentDefault = Number(actor.ownership?.default ?? 0);
      if (currentDefault >= OWNER) return;
      await actor.update({ "ownership.default": OWNER });
      console.log(`${LOG_PREFIX} Granted OWNER default ownership for shopkeeper ${actor.name}`);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Could not update shopkeeper ownership for player access`, error);
    }
  }

  /**
   * One-time / ready migration: grant player access on every enabled shopkeeper.
   */
  async ensureAllEnabledShopAccess() {
    if (!game.user?.isGM) return;
    const actors = game.actors?.contents ?? game.actors ?? [];
    for (const actor of actors) {
      if (!actor || actor.type !== "npc") continue;
      const shop = this.getShopkeeper(actor);
      if (!shop.enabled) continue;
      await this.ensurePlayerShopAccess(actor);
    }
  }

  /**
   * @param {Actor} actor
   * @returns {Promise<object>}
   */
  async disableShopkeeper(actor) {
    if (!game.user?.isGM) throw new Error("Only the GM can disable shopkeepers.");
    return this.updateShopkeeper(actor, { enabled: false });
  }

  /**
   * Regenerate automatic stock from scratch.
   * Always replaces automatic entries. Manual entries are kept unless clearManual.
   * When reshuffle/force regenerate, a new random salt produces a different assortment.
   * @param {Actor} actor
   * @param {{force?: boolean, reshuffle?: boolean, clearManual?: boolean}} [options]
   * @returns {Promise<object>}
   */
  async regenerateInventory(actor, { force = false, reshuffle = false, clearManual = false } = {}) {
    if (!game.user?.isGM) {
      console.warn(`${LOG_PREFIX} Ignoring inventory regenerate from non-GM user`);
      return this.getShopkeeper(actor);
    }

    const shop = this.getShopkeeper(actor);
    if (!shop.enabled && !force) return shop;

    const partyLevel = this.getEffectivePartyLevel(shop);
    const economy = ECONOMY_TIERS[shop.economyTier] ?? ECONOMY_TIERS.standard;
    const stockCount = Math.max(1, Math.min(100, Math.floor(Number(shop.stockCount) || 25)));
    const { selectedIds } = resolveSelectedItemPacks();
    const shouldReshuffle = Boolean(force || reshuffle);
    const seedSalt = shouldReshuffle ? newGenerationSalt() : "stable";
    const partyAware = await this.resolvePartyAwareContext(shop);
    const partyAwareSettings = normalizePartyAwareSettings(shop);
    const generationKey = [
      shop.shopType,
      shop.economyTier,
      shop.partyLevelMode,
      partyLevel,
      shop.priceMultiplier,
      stockCount,
      selectedIds.join(","),
      actor.id,
      partyAwareSettings.partyAwareInventory ? "partyAware" : "partyOff",
      partyAwareSettings.partyAwareInventory
        ? partyProfileFingerprint(
            partyAware.profile,
            partyAware.detectionMode,
            partyAwareSettings.partyActorUuids
          )
        : "off",
      shouldReshuffle ? seedSalt : "stable"
    ].join("|");

    if (!force && !reshuffle && shop.generationKey === generationKey && Array.isArray(shop.inventory)) {
      return shop;
    }

    if (!selectedIds.length) {
      ui.notifications?.warn(
        "TownForge has no Shopkeeper Item Sources selected. Open Configure Settings → Module Settings → TownForge → Shopkeeper Item Sources."
      );
      console.warn(`${LOG_PREFIX} Shop inventory generation blocked: no item sources selected`);
      return this.updateShopkeeper(actor, {
        inventory: clearManual
          ? []
          : (shop.inventory ?? []).filter((entry) => entry?.source === "manual"),
        generatedAt: Date.now(),
        generationKey
      });
    }

    // Delete previous automatic stock, then build a fresh list for the current shop type.
    const manual = clearManual
      ? []
      : (shop.inventory ?? []).filter((entry) => entry?.source === "manual");
    const automatic = await this.#generateAutomaticStock(actor, shop, partyLevel, economy, {
      seedSalt,
      reshuffle: shouldReshuffle,
      stockCount,
      partyProfile: partyAwareSettings.partyAwareInventory ? partyAware.profile : null,
      partyAwareEnabled: partyAwareSettings.partyAwareInventory
    });

    if (partyAwareSettings.partyAwareInventory && partyAware.profile.empty) {
      ui.notifications?.warn("No player characters detected. Using standard inventory generation.");
    } else if (partyAware.missingUuids.length) {
      ui.notifications?.warn(
        `TownForge could not find ${partyAware.missingUuids.length} manually selected party actor(s); they were skipped.`
      );
    }

    const inventory = [...automatic, ...manual];

    console.log(
      `${LOG_PREFIX} Generated ${automatic.length} automatic stock item(s) for ${actor.name} (${shop.shopType}, lvl ${partyLevel}, ${economy.id}, salt ${seedSalt}${
        partyAwareSettings.partyAwareInventory && !partyAware.profile.empty ? ", party-aware" : ""
      })`
    );

    return this.updateShopkeeper(actor, {
      inventory,
      generatedAt: Date.now(),
      generationKey
    });
  }

  /**
   * Inventory rows for merchant UI (includes sold-out finite items).
   * @param {Actor} actor
   * @returns {object[]}
   */
  getDisplayInventory(actor) {
    const shop = this.getShopkeeper(actor);
    if (!shop.enabled) return [];
    return (shop.inventory ?? []).filter((entry) => entry?.id && entry?.uuid && entry?.name);
  }

  /**
   * @param {Actor} actor
   * @returns {object[]}
   */
  getSellableInventory(actor) {
    return this.getDisplayInventory(actor).filter((entry) => {
      if (this.#isUnlimited(entry)) return true;
      return Number(entry.quantity) > 0;
    });
  }

  /**
   * Build filter tabs that actually appear in stock.
   * @param {Actor} actor
   * @returns {{id:string,label:string}[]}
   */
  getAvailableFilters(actor) {
    const shop = this.getShopkeeper(actor);
    const inventory = this.getDisplayInventory(actor);
    const present = new Set(inventory.map((entry) => entry.filter).filter(Boolean));
    const defs = SHOP_FILTERS[shop.shopType] ?? SHOP_FILTERS["general-store"];
    return defs.filter((def) => def.id === "all" || present.has(def.id));
  }

  /**
   * Lightweight item description for the detail panel (cached).
   * @param {object} stock
   * @returns {Promise<string>}
   */
  async getStockDescription(stock) {
    const detail = await this.getStockDetail(stock);
    return detail.description;
  }

  /**
   * Richer item detail for the merchant card (description + light properties).
   * @param {object} stock
   * @returns {Promise<{description:string, properties:string[]}>}
   */
  async getStockDetail(stock) {
    if (!stock?.uuid) return { description: "", properties: [] };
    const cached = this.#detailCache.get(stock.uuid);
    if (cached && Date.now() - cached.loadedAt < 5 * 60 * 1000) {
      return {
        description: cached.description,
        properties: cached.properties ?? []
      };
    }
    try {
      const item = await fromUuid(stock.uuid);
      const raw =
        item?.system?.description?.value ??
        item?.system?.description ??
        item?.system?.unidentified?.description ??
        "";
      const description = this.#stripHtml(String(raw)).slice(0, 600);
      const properties = this.#extractItemProperties(item);
      this.#detailCache.set(stock.uuid, { description, properties, loadedAt: Date.now() });
      return { description, properties };
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed loading item detail for ${stock.uuid}`, error);
      return { description: "", properties: [] };
    }
  }

  /**
   * @param {Item|null|undefined} item
   * @returns {string[]}
   */
  #extractItemProperties(item) {
    if (!item?.system) return [];
    const props = [];
    const system = item.system;
    if (system.rarity) props.push(String(system.rarity));
    if (system.armor?.type) props.push(`${system.armor.type} armor`);
    if (system.armor?.value != null) props.push(`AC ${system.armor.value}`);
    if (system.damage?.parts?.length) {
      const dmg = system.damage.parts
        .map((part) => (Array.isArray(part) ? part.filter(Boolean).join(" ") : String(part)))
        .filter(Boolean)
        .join(", ");
      if (dmg) props.push(dmg);
    }
    if (system.weight?.value != null) props.push(`${system.weight.value} lb`);
    if (Array.isArray(system.properties)) {
      for (const prop of system.properties.slice(0, 4)) {
        if (prop) props.push(String(prop));
      }
    } else if (system.properties && typeof system.properties === "object") {
      for (const [key, enabled] of Object.entries(system.properties)) {
        if (enabled) props.push(String(key));
      }
    }
    return [...new Set(props.map((entry) => entry.trim()).filter(Boolean))].slice(0, 6);
  }

  /**
   * Entry point for UI purchases (single-item convenience wrapper around trade).
   * @param {{merchantUuid: string, buyerUuid: string, stockId: string, quantity?: number}} request
   * @returns {Promise<{ok: boolean, message?: string}>}
   */
  async purchaseItem(request) {
    return this.executeTrade({
      merchantUuid: request.merchantUuid,
      buyerUuid: request.buyerUuid,
      buys: [
        {
          stockId: String(request.stockId || ""),
          quantity: Math.max(1, Math.min(99, Math.floor(Number(request.quantity) || 1)))
        }
      ],
      sells: []
    });
  }

  /**
   * Atomic buy+sell trade — instant, BG3-style (no GM approval gate).
   * Players fulfill locally using shopkeeper ownership granted for enabled shops.
   * @param {{
   *   merchantUuid: string,
   *   buyerUuid: string,
   *   buys?: {stockId:string, quantity?:number}[],
   *   sells?: {itemId:string, quantity?:number}[]
   * }} request
   * @returns {Promise<{ok:boolean, message?:string}>}
   */
  async executeTrade(request) {
    const lockKey = `trade:${request.merchantUuid}:${request.buyerUuid}`;
    if (this.#purchaseLocks.has(lockKey)) {
      return { ok: false, message: "Trade already in progress." };
    }
    this.#purchaseLocks.add(lockKey);

    try {
      const clean = {
        merchantUuid: String(request.merchantUuid || ""),
        buyerUuid: String(request.buyerUuid || ""),
        buys: Array.isArray(request.buys)
          ? request.buys
              .map((row) => ({
                stockId: String(row?.stockId || ""),
                quantity: Math.max(1, Math.min(99, Math.floor(Number(row?.quantity) || 1)))
              }))
              .filter((row) => row.stockId)
          : [],
        sells: Array.isArray(request.sells)
          ? request.sells
              .map((row) => ({
                itemId: String(row?.itemId || ""),
                quantity: Math.max(1, Math.min(99, Math.floor(Number(row?.quantity) || 1)))
              }))
              .filter((row) => row.itemId)
          : []
      };

      if (!clean.buys.length && !clean.sells.length) {
        return { ok: false, message: "Trade is empty." };
      }

      return await this.#fulfillTrade(clean, game.user.id);
    } finally {
      this.#purchaseLocks.delete(lockKey);
    }
  }

  /**
   * Authoritative trade fulfillment.
   * @param {{merchantUuid:string,buyerUuid:string,buys:object[],sells:object[]}} request
   * @param {string} requesterId
   */
  async #fulfillTrade(request, requesterId) {
    const fulfillKey = `fulfill-trade:${request.merchantUuid}:${request.buyerUuid}`;
    if (this.#purchaseLocks.has(fulfillKey)) {
      return { ok: false, message: "Trade already in progress." };
    }
    this.#purchaseLocks.add(fulfillKey);

    try {
      const merchant = await fromUuid(request.merchantUuid);
      const buyer = await fromUuid(request.buyerUuid);
      if (!merchant || merchant.documentName !== "Actor") {
        return { ok: false, message: "Shop unavailable." };
      }
      if (!buyer || buyer.documentName !== "Actor" || buyer.type !== "character") {
        return { ok: false, message: "Character not selected." };
      }

      const requester = game.users?.get(requesterId);
      if (!requester || !this.#userOwnsActor(requester, buyer)) {
        return { ok: false, message: "Character not selected." };
      }

      const shop = this.getShopkeeper(merchant);
      if (!shop.enabled) return { ok: false, message: "Shop unavailable." };

      // --- Validate buys ---
      let buyTotalCP = 0;
      /** @type {{stock:object, qty:number, sourceItem:Item}[]} */
      const resolvedBuys = [];
      for (const buy of request.buys) {
        const check = validatePurchaseRequest({
          shop,
          stockId: buy.stockId,
          buyerOwned: true,
          buyerType: buyer.type,
          buyerCurrency: { pp: 999999, gp: 999999, ep: 999999, sp: 999999, cp: 999999 },
          quantity: buy.quantity
        });
        if (!check.ok) return { ok: false, message: check.message };
        const sourceItem = await fromUuid(check.stock.uuid);
        if (!sourceItem || sourceItem.documentName !== "Item") {
          return { ok: false, message: "Item unavailable." };
        }
        buyTotalCP += check.priceCP;
        resolvedBuys.push({ stock: check.stock, qty: check.quantity, sourceItem, unitPriceCP: check.unitPriceCP });
      }

      // --- Validate sells ---
      let sellTotalCP = 0;
      /** @type {{item:Item, qty:number, unitPriceCP:number}[]} */
      const resolvedSells = [];
      for (const sell of request.sells) {
        const item = buyer.items?.get?.(sell.itemId) ?? buyer.items?.find?.((entry) => entry.id === sell.itemId);
        if (!item) return { ok: false, message: "Cannot sell that item." };
        if (!this.#isSellableItem(item)) {
          return { ok: false, message: `${item.name} cannot be sold here.` };
        }
        const ownedQty = Math.max(1, Number(item.system?.quantity) || 1);
        const qty = Math.min(sell.quantity, ownedQty);
        if (qty <= 0) return { ok: false, message: "Cannot sell that item." };
        const unitPriceCP = this.#sellPriceFromItem(item, shop);
        sellTotalCP += unitPriceCP * qty;
        resolvedSells.push({ item, qty, unitPriceCP });
      }

      const netCP = buyTotalCP - sellTotalCP;
      let currency = foundry.utils.deepClone(buyer.system?.currency ?? {});
      const purse = this.currencyToCopper(currency);
      if (netCP > 0 && purse < netCP) {
        return { ok: false, message: "Not enough gold." };
      }

      // Re-check shop stock after async gaps.
      const latestShop = this.getShopkeeper(merchant);
      const previousInventory = Array.isArray(latestShop.inventory) ? latestShop.inventory.slice() : [];
      for (const buy of resolvedBuys) {
        const latestStock = previousInventory.find((entry) => entry.id === buy.stock.id);
        if (!latestStock) return { ok: false, message: "Item unavailable." };
        if (!this.#isUnlimited(latestStock) && Number(latestStock.quantity) < buy.qty) {
          return { ok: false, message: "Not enough stock." };
        }
      }

      if (netCP > 0) currency = this.deductCopper(currency, netCP);
      else if (netCP < 0) currency = this.addCopper(currency, -netCP);

      // Apply currency first.
      await buyer.update({ "system.currency": currency });

      // Remove sold items from buyer.
      for (const sell of resolvedSells) {
        const ownedQty = Math.max(1, Number(sell.item.system?.quantity) || 1);
        if (sell.qty >= ownedQty) {
          await sell.item.delete();
        } else {
          await sell.item.update({ "system.quantity": ownedQty - sell.qty });
        }
      }

      // Grant purchased items.
      const createData = [];
      for (const buy of resolvedBuys) {
        const itemData = buy.sourceItem.toObject();
        delete itemData._id;
        if (itemData.system && "quantity" in itemData.system) {
          itemData.system.quantity = buy.qty;
        }
        createData.push(itemData);
      }
      if (createData.length) {
        await buyer.createEmbeddedDocuments("Item", createData);
      }

      // Update merchant inventory: decrement finite buys, restock sold goods.
      // Preserve existing unlimited/automatic rows so a trade cannot wipe the shelf.
      if (game.user.isGM || merchant.isOwner) {
        let inventory = previousInventory.map((entry) => ({ ...entry }));
        for (const buy of resolvedBuys) {
          inventory = inventory.map((entry) => {
            if (entry.id !== buy.stock.id || this.#isUnlimited(entry)) return entry;
            return { ...entry, quantity: Math.max(0, Number(entry.quantity) - buy.qty) };
          });
        }
        for (const sell of resolvedSells) {
          inventory = this.#restockSoldItem(inventory, sell);
        }
        inventory = inventory.filter(
          (entry) => this.#isUnlimited(entry) || Number(entry.quantity) > 0
        );

        // Safety net: never allow a trade write to drop prior unlimited stock.
        const keptIds = new Set(inventory.map((entry) => entry.id));
        for (const prev of previousInventory) {
          if (keptIds.has(prev.id)) continue;
          if (this.#isUnlimited(prev) || prev.source === "automatic") {
            inventory.push({ ...prev });
            keptIds.add(prev.id);
          }
        }

        await this.updateShopkeeper(merchant, { inventory }, { allowNonGM: true });
      } else {
        console.warn(
          `${LOG_PREFIX} Trade completed for ${buyer.name}, but shop stock could not update (missing merchant ownership). Re-open the shopkeeper config once as GM.`
        );
      }

      const buyCount = resolvedBuys.reduce((sum, row) => sum + row.qty, 0);
      const sellCount = resolvedSells.reduce((sum, row) => sum + row.qty, 0);
      const netLabel =
        netCP === 0
          ? "even trade"
          : netCP > 0
            ? `paid ${this.formatPrice(netCP)}`
            : `received ${this.formatPrice(-netCP)}`;
      const message = `Trade complete (${buyCount} bought, ${sellCount} sold, ${netLabel}).`;
      console.log(`${LOG_PREFIX} ${message} — ${buyer.name} @ ${merchant.name}`);

      await this.#announceTradeInChat({
        buyer,
        merchant,
        shop: latestShop,
        resolvedBuys,
        resolvedSells,
        netCP
      });

      return { ok: true, message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Trade failed`, error);
      return { ok: false, message: "Trade failed." };
    } finally {
      this.#purchaseLocks.delete(fulfillKey);
    }
  }

  /**
   * Public chat announcement for a completed trade (optional world setting).
   * @param {{
   *   buyer: Actor,
   *   merchant: Actor,
   *   shop: object,
   *   resolvedBuys: object[],
   *   resolvedSells: object[],
   *   netCP: number
   * }} detail
   */
  async #announceTradeInChat(detail) {
    let enabled = true;
    try {
      enabled = Boolean(game.settings.get(MODULE_ID, ANNOUNCE_TRADES_SETTING));
    } catch (_error) {
      enabled = true;
    }
    if (!enabled) return;

    const { buyer, merchant, shop, resolvedBuys, resolvedSells, netCP } = detail;
    const shopName = shop?.shopName || `${merchant.name}'s Shop`;
    const escape = (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const buyRows = resolvedBuys
      .map(
        (row) =>
          `<li><strong>${escape(row.qty)}×</strong> ${escape(row.stock.name)} <span>(${escape(
            this.formatPrice(row.unitPriceCP * row.qty)
          )})</span></li>`
      )
      .join("");
    const sellRows = resolvedSells
      .map(
        (row) =>
          `<li><strong>${escape(row.qty)}×</strong> ${escape(row.item.name)} <span>(${escape(
            this.formatPrice(row.unitPriceCP * row.qty)
          )})</span></li>`
      )
      .join("");

    let netHtml = `<p class="townforge-trade-chat-net">Even trade</p>`;
    if (netCP > 0) {
      netHtml = `<p class="townforge-trade-chat-net is-pay"><strong>${escape(buyer.name)}</strong> paid <strong>${escape(
        this.formatPrice(netCP)
      )}</strong></p>`;
    } else if (netCP < 0) {
      netHtml = `<p class="townforge-trade-chat-net is-gain"><strong>${escape(buyer.name)}</strong> received <strong>${escape(
        this.formatPrice(-netCP)
      )}</strong></p>`;
    }

    const content = `
      <div class="townforge-trade-chat">
        <header>
          <strong>${escape(buyer.name)}</strong>
          <span>traded with</span>
          <strong>${escape(merchant.name)}</strong>
        </header>
        <p class="townforge-trade-chat-shop">${escape(shopName)}</p>
        ${
          buyRows
            ? `<div class="townforge-trade-chat-block"><h4>Bought</h4><ul>${buyRows}</ul></div>`
            : ""
        }
        ${
          sellRows
            ? `<div class="townforge-trade-chat-block"><h4>Sold</h4><ul>${sellRows}</ul></div>`
            : ""
        }
        ${netHtml}
      </div>
    `.trim();

    try {
      const payload = {
        content,
        speaker: ChatMessage.getSpeaker({ actor: buyer }),
        flavor: "TownForge Trade"
      };
      // Foundry v12+ prefers style; older builds used type.
      if (CONST?.CHAT_MESSAGE_STYLES?.OTHER != null) {
        payload.style = CONST.CHAT_MESSAGE_STYLES.OTHER;
      } else if (CONST?.CHAT_MESSAGE_TYPES?.OTHER != null) {
        payload.type = CONST.CHAT_MESSAGE_TYPES.OTHER;
      }
      await ChatMessage.create(payload);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to announce trade in chat`, error);
    }
  }

  /**
   * @param {Item} item
   * @returns {boolean}
   */
  #isSellableItem(item) {
    const type = String(item?.type || "");
    return ["weapon", "equipment", "consumable", "tool", "loot", "container"].includes(type);
  }

  /**
   * Put a sold player item back on the merchant shelf for resale (BG3-style).
   * Merges into an existing finite stack of the same uuid; skips if infinite stock
   * of that uuid already exists.
   * @param {object[]} inventory
   * @param {{item:Item, qty:number, unitPriceCP:number}} sell
   * @returns {object[]}
   */
  #restockSoldItem(inventory, sell) {
    const uuid = sell.item?.uuid;
    const priceCP = Math.max(1, Math.round(sell.unitPriceCP / SELL_PRICE_RATIO) || sell.unitPriceCP);
    if (!uuid) {
      const entry = this.#toStockEntry(sell.item, { source: "manual", priceCP, quantity: sell.qty });
      entry.id = `tfstock-manual-${stableHash(`${sell.item.id}:${Date.now()}:${Math.random()}`)}`;
      entry.priceLabel = this.formatPrice(entry.priceCP);
      return [...inventory, sanitizeStockEntry(entry)];
    }

    const hasInfinite = inventory.some((entry) => entry.uuid === uuid && this.#isUnlimited(entry));
    if (hasInfinite) return inventory;

    const existing = inventory.find(
      (entry) => entry.uuid === uuid && !this.#isUnlimited(entry) && Number(entry.quantity) >= 0
    );
    if (existing) {
      return inventory.map((entry) => {
        if (entry.id !== existing.id) return entry;
        return sanitizeStockEntry({
          ...entry,
          quantity: Number(entry.quantity) + sell.qty,
          priceCP,
          priceLabel: this.formatPrice(priceCP),
          source: entry.source || "manual"
        });
      });
    }

    const entry = this.#toStockEntry(sell.item, { source: "manual", priceCP, quantity: sell.qty });
    entry.priceLabel = this.formatPrice(entry.priceCP);
    return [...inventory, sanitizeStockEntry(entry)];
  }

  /**
   * Buyback price for a player item (half value by default).
   * @param {Item} item
   * @param {object} shop
   * @returns {number}
   */
  #sellPriceFromItem(item, shop) {
    const base = this.#priceFromItem(item, 1);
    void shop;
    return Math.max(1, Math.round(base * SELL_PRICE_RATIO));
  }

  /** @deprecated Prefer #fulfillTrade; kept for internal single-buy paths. */
  async #fulfillPurchase(request, requesterId) {
    return this.#fulfillTrade(
      {
        merchantUuid: request.merchantUuid,
        buyerUuid: request.buyerUuid,
        buys: [{ stockId: request.stockId, quantity: request.quantity || 1 }],
        sells: []
      },
      requesterId
    );
  }

  /**
   * Ask an online GM to fulfill a trade authoritatively.
   */
  #requestTradeViaSocket(request) {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.#pendingPurchases.delete(requestId);
        resolve({
          ok: false,
          message: "Shop unavailable. The GM did not respond — ask them to refresh TownForge."
        });
      }, 20000);

      this.#pendingPurchases.set(requestId, { resolve, timeout });
      game.socket.emit(`module.${MODULE_ID}`, {
        type: "tradeRequest",
        requestId,
        userId: game.user.id,
        merchantUuid: request.merchantUuid,
        buyerUuid: request.buyerUuid,
        buys: request.buys,
        sells: request.sells
      });
    });
  }

  /** @deprecated */
  #requestPurchaseViaSocket(request) {
    return this.#requestTradeViaSocket({
      merchantUuid: request.merchantUuid,
      buyerUuid: request.buyerUuid,
      buys: [{ stockId: request.stockId, quantity: request.quantity || 1 }],
      sells: []
    });
  }

  currencyToCopper(currency = {}) {
    return currencyToCopperPure(currency);
  }

  addCopper(currency, amountCP) {
    return addCopperPure(currency, amountCP);
  }

  /**
   * Deduct copper-equivalent while preserving denominations.
   * @param {object} currency
   * @param {number} priceCP
   * @returns {object}
   */
  deductCopper(currency, priceCP) {
    return deductCopperPure(currency, priceCP);
  }

  formatPrice(priceCP) {
    return formatCopper(priceCP);
  }

  formatWallet(currency) {
    return formatWallet(currency);
  }

  /**
   * Sell price helper for UI.
   * @param {Item} item
   * @param {Actor} merchant
   */
  getSellPriceCP(item, merchant) {
    const shop = this.getShopkeeper(merchant);
    return this.#sellPriceFromItem(item, shop);
  }

  /**
   * Whether this GM client should handle authoritative shop sockets.
   * @returns {boolean}
   */
  #shouldHandleShopAuthority() {
    if (!game.user?.isGM || !game.user.active) return false;
    const activeGM = game.users?.activeGM;
    if (activeGM) return activeGM.id === game.user.id;
    const ranked = (game.users?.contents ?? game.users ?? [])
      .filter((user) => user.isGM && user.active)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return ranked[0]?.id === game.user.id;
  }

  /**
   * Add a manual stock entry from an Item document/UUID.
   * @param {Actor} merchant
   * @param {string|Item} itemOrUuid
   * @param {{priceMultiplier?: number, quantity?: number|null, priceCP?: number}} [options]
   */
  async addManualItem(merchant, itemOrUuid, options = {}) {
    if (!game.user?.isGM) throw new Error("Only the GM can edit shop inventory.");
    const item = typeof itemOrUuid === "string" ? await fromUuid(itemOrUuid) : itemOrUuid;
    if (!item || item.documentName !== "Item") throw new Error("Item not found");
    const shop = this.getShopkeeper(merchant);
    const priceCP =
      options.priceCP != null
        ? Math.max(1, Number(options.priceCP) || 1)
        : this.#priceFromItem(item, options.priceMultiplier ?? shop.priceMultiplier);
    const entry = this.#toStockEntry(item, {
      source: "manual",
      priceCP,
      quantity: options.quantity === undefined ? null : options.quantity
    });
    const inventory = [...(shop.inventory ?? []).filter((row) => row.id !== entry.id), entry];
    return this.updateShopkeeper(merchant, {
      inventory,
      inventoryMode: INVENTORY_MODES.manual
    });
  }

  /**
   * @param {Actor} merchant
   * @param {string} stockId
   * @param {{priceCP?: number, quantity?: number|null, name?: string}} patch
   */
  async updateStockEntry(merchant, stockId, patch = {}) {
    if (!game.user?.isGM) throw new Error("Only the GM can edit shop inventory.");
    const shop = this.getShopkeeper(merchant);
    let changed = false;
    const inventory = (shop.inventory ?? []).map((entry) => {
      if (entry.id !== stockId) return entry;
      changed = true;
      const next = { ...entry };
      if (patch.priceCP != null) {
        next.priceCP = Math.max(1, Number(patch.priceCP) || 1);
        next.priceLabel = this.formatPrice(next.priceCP);
      }
      if ("quantity" in patch) {
        if (patch.quantity == null || patch.quantity === "" || Number(patch.quantity) < 0) {
          next.unlimited = true;
          delete next.quantity;
        } else {
          next.unlimited = false;
          next.quantity = Math.max(0, Number(patch.quantity) || 0);
        }
      }
      if (patch.name) next.name = String(patch.name);
      return next;
    });
    if (!changed) throw new Error("Stock entry not found");
    return this.updateShopkeeper(merchant, { inventory });
  }

  /**
   * @param {Actor} merchant
   * @param {string} stockId
   */
  async removeStockEntry(merchant, stockId) {
    if (!game.user?.isGM) throw new Error("Only the GM can edit shop inventory.");
    const shop = this.getShopkeeper(merchant);
    const inventory = (shop.inventory ?? []).filter((entry) => entry.id !== stockId);
    return this.updateShopkeeper(merchant, { inventory });
  }

  /**
   * Reset to automatic mode and regenerate, dropping manual overrides.
   * @param {Actor} merchant
   */
  async resetToAutomatic(merchant) {
    if (!game.user?.isGM) throw new Error("Only the GM can reset shop inventory.");
    await this.updateShopkeeper(merchant, {
      inventoryMode: INVENTORY_MODES.automatic,
      inventory: []
    });
    return this.regenerateInventory(merchant, { force: true, reshuffle: true, clearManual: true });
  }

  registerSockets() {
    game.socket.on(`module.${MODULE_ID}`, (payload) => {
      if (!payload || typeof payload !== "object") return;

      if ((payload.type === "tradeRequest" || payload.type === "purchaseRequest") && game.user.isGM) {
        void this.#handleTradeRequest(payload);
        return;
      }

      if (payload.type === "tradeResult" || payload.type === "purchaseResult") {
        const pending = this.#pendingPurchases.get(payload.requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.#pendingPurchases.delete(payload.requestId);
        pending.resolve({
          ok: Boolean(payload.ok),
          message:
            payload.message ||
            (payload.ok ? "Trade complete." : "Trade failed.")
        });
        return;
      }

      if (payload.type === "shopInventoryChanged") {
        refreshOpenShopUIs(payload.merchantUuid || payload.merchantId);
        setTimeout(() => {
          refreshOpenShopUIs(payload.merchantUuid || payload.merchantId, { immediate: true });
        }, 200);
        return;
      }

      if (payload.type === "stockDecrement" && game.user.isGM) {
        void this.#handleStockDecrement(payload);
      }
    });
  }

  /**
   * Notify every connected client that merchant stock/config changed.
   * @param {Actor} actor
   */
  #broadcastShopInventoryChanged(actor) {
    if (!actor || !game.socket) return;
    game.socket.emit(`module.${MODULE_ID}`, {
      type: "shopInventoryChanged",
      merchantUuid: actor.uuid,
      merchantId: actor.id
    });
  }

  async #handleTradeRequest(payload) {
    if (!this.#shouldHandleShopAuthority()) return;

    let result = { ok: false, message: "Trade failed." };
    try {
      const request =
        payload.type === "purchaseRequest"
          ? {
              merchantUuid: payload.merchantUuid,
              buyerUuid: payload.buyerUuid,
              buys: [{ stockId: payload.stockId, quantity: payload.quantity || 1 }],
              sells: []
            }
          : {
              merchantUuid: payload.merchantUuid,
              buyerUuid: payload.buyerUuid,
              buys: payload.buys ?? [],
              sells: payload.sells ?? []
            };
      result = await this.#fulfillTrade(request, payload.userId);
    } catch (error) {
      console.error(`${LOG_PREFIX} Trade request handler failed`, error);
      result = { ok: false, message: "Trade failed." };
    }

    game.socket.emit(`module.${MODULE_ID}`, {
      type: "tradeResult",
      requestId: payload.requestId,
      ok: result.ok,
      message: result.message
    });
    // Compat for older clients still waiting on purchaseResult.
    game.socket.emit(`module.${MODULE_ID}`, {
      type: "purchaseResult",
      requestId: payload.requestId,
      ok: result.ok,
      message: result.message
    });
  }

  async #handlePurchaseRequest(payload) {
    return this.#handleTradeRequest(payload);
  }

  #emitStockDecrement(merchantUuid, stockId) {
    game.socket.emit(`module.${MODULE_ID}`, {
      type: "stockDecrement",
      merchantUuid,
      stockId
    });
  }

  async #handleStockDecrement(payload) {
    if (!this.#shouldHandleShopAuthority()) return;
    const merchant = await fromUuid(payload.merchantUuid);
    if (!merchant) return;
    const shop = this.getShopkeeper(merchant);
    const inventory = (shop.inventory ?? []).map((entry) => {
      if (entry.id !== payload.stockId || this.#isUnlimited(entry)) return entry;
      return { ...entry, quantity: Math.max(0, Number(entry.quantity) - 1) };
    });
    await this.updateShopkeeper(merchant, { inventory });
  }

  #stripHtml(html = "") {
    return String(html)
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * @param {User} user
   * @param {Actor} actor
   * @returns {boolean}
   */
  #userOwnsActor(user, actor) {
    if (!user || !actor) return false;
    try {
      if (typeof actor.testUserPermission === "function") {
        const level =
          CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ??
          CONST?.DOCUMENT_PERMISSION_LEVELS?.OWNER ??
          3;
        return actor.testUserPermission(user, level);
      }
    } catch (_error) {
      // fall through
    }
    const ownership = actor.ownership ?? actor.data?.ownership ?? {};
    const value = ownership[user.id];
    return Number(value) >= 3 || value === "OWNER";
  }

  async #generateAutomaticStock(actor, shop, partyLevel, economy, options = {}) {
    const seedSalt = options.seedSalt || "stable";
    const reshuffle = Boolean(options.reshuffle);
    const index = await this.#loadItemIndex();
    if (!index.length) {
      const { selectedIds } = resolveSelectedItemPacks();
      if (!selectedIds.length) {
        ui.notifications?.warn(
          "TownForge has no Shopkeeper Item Sources selected. Open Configure Settings → Module Settings → TownForge → Shopkeeper Item Sources."
        );
      } else {
        ui.notifications?.warn(
          "TownForge could not load items from the selected Shopkeeper Item Sources."
        );
      }
      return [];
    }

    const prefiltered = index.filter((item) => this.#matchesShop(item, shop.shopType));
    const candidates = [];
    // Cap enrichment work for thin indexes (missing system fields).
    let enrichBudget = 160;
    for (const item of prefiltered) {
      let row = item;
      if (item.thin || !(item.valueCP > 0)) {
        if (enrichBudget <= 0) continue;
        enrichBudget -= 1;
        row = await this.#ensureIndexDetails(item);
      }
      if (!row) continue;
      if (!this.#matchesShop(row, shop.shopType)) continue;
      if (!this.#isMundaneSellable(row)) continue;
      candidates.push(row);
    }

    const maxValueGP = economy.maxValueGP * (1 + (partyLevel - 1) * 0.12);
    const affordable = candidates.filter((item) => item.valueGP <= maxValueGP);

    const stretch = candidates.filter(
      (item) => item.valueGP > maxValueGP && item.valueGP <= maxValueGP * 2.5
    );

    const pool = [...affordable];
    const stockCount = Math.max(1, Math.min(100, Math.floor(Number(options.stockCount) || shop.stockCount || 25)));
    const stretchCount = Math.floor(stockCount * economy.expensiveChance);
    const partyProfile =
      options.partyAwareEnabled && options.partyProfile && !options.partyProfile.empty
        ? options.partyProfile
        : null;
    const weightFn = (item) => scoreItemPartyWeight(item, partyProfile);
    const pick = reshuffle
      ? (list, count) =>
          partyProfile ? weightedRandomPick(list, count, weightFn) : randomPick(list, count)
      : (list, count, label) =>
          partyProfile
            ? weightedSeededPick(
                list,
                count,
                weightFn,
                `${actor.id}:${shop.shopType}:${label}:${partyLevel}:${seedSalt}:party`
              )
            : seededPick(list, count, `${actor.id}:${shop.shopType}:${label}:${partyLevel}:${seedSalt}`);

    const seededStretch = pick(stretch, stretchCount, "stretch");
    pool.push(...seededStretch);

    const unique = new Map();
    for (const item of pool) unique.set(item.uuid, item);

    const picked = pick([...unique.values()], stockCount, economy.id);

    // Do not force staple weapons/armor back in on reshuffle — that made every
    // regenerate look like the same list in the same order.
    if (!reshuffle && (shop.shopType === "blacksmith" || shop.shopType === "armorer")) {
      this.#ensureNamedItems(
        picked,
        unique,
        [
          "Dagger",
          "Handaxe",
          "Light Hammer",
          "Mace",
          "Spear",
          "Longsword",
          "Battleaxe",
          "Warhammer",
          "Shield",
          "Chain Shirt",
          "Scale Mail"
        ],
        stockCount
      );
    }

    return picked.map((item) =>
      sanitizeStockEntry(
        this.#toStockEntry(item, {
          source: "automatic",
          priceCP: this.#priceFromIndexItem(item, shop.priceMultiplier),
          quantity: -1
        })
      )
    );
  }

  #ensureNamedItems(picked, uniqueMap, names, maxCount) {
    for (const name of names) {
      if (picked.length >= maxCount) break;
      if (picked.some((item) => item.name?.toLowerCase() === name.toLowerCase())) continue;
      const match = [...uniqueMap.values()].find(
        (item) => item.name?.toLowerCase() === name.toLowerCase()
      );
      if (match) picked.push(match);
    }
  }

  #matchesShop(item, shopType) {
    const type = item.type;
    const name = item.name?.toLowerCase?.() ?? "";
    const armorType = String(item.armorType ?? "").toLowerCase();
    const weaponType = String(item.weaponType ?? "").toLowerCase();

    switch (shopType) {
      case "blacksmith":
        return this.#isBlacksmithItem(item, type, name, armorType, weaponType);
      case "armorer":
        return (
          type === "equipment" &&
          ["light", "medium", "heavy", "shield"].includes(armorType)
        );
      case "alchemist":
        return (
          type === "consumable" ||
          /potion|poison|acid|alchem|herbal|component/i.test(name) ||
          (type === "tool" && /alchem|herbal|poison/i.test(name))
        );
      case "temple":
        return (
          /holy|healer|prayer|incense|symbol|potion of healing/i.test(name) ||
          (type === "consumable" && /potion|healing/i.test(name))
        );
      case "inn":
        return /ration|waterskin|ale|wine|food|lamp|oil|candle|bedroll|soap/i.test(name);
      case "tailor":
        return (
          (type === "equipment" && (armorType === "clothing" || armorType === "light")) ||
          /clothes|costume|robe|fine|common clothes|traveler/i.test(name)
        );
      case "stable":
        return /feed|bit and bridle|saddle|stabling|animal|pony|horse|mule/i.test(name);
      case "adventuring-supplies":
        return (
          type === "consumable" ||
          type === "tool" ||
          /rope|torch|ration|pack|kit|grappling|piton|tinder|waterskin|ladder|chain|crowbar|hammer|lantern|oil|pole|tent|blanket/i.test(
            name
          )
        );
      case "general-store":
      default:
        return (
          type === "consumable" ||
          type === "tool" ||
          type === "container" ||
          (type === "equipment" && armorType !== "heavy") ||
          (type === "weapon" && item.valueGP <= 25)
        );
    }
  }

  #isBlacksmithItem(item, type, name, armorType, weaponType) {
    if (type === "weapon") {
      if (/bow|crossbow|sling|net|blowgun|dart|firearm|gun/i.test(name)) return false;
      if (weaponType.includes("r") && !weaponType.includes("m")) return false;
      // Prefer melee / metal weapons; allow thrown metal weapons by name.
      return true;
    }
    if (type === "equipment" && ["shield", "light", "medium", "heavy"].includes(armorType)) {
      return true;
    }
    if (type === "tool" && /smith/i.test(name)) return true;
    if (/shield/i.test(name) && type === "equipment") return true;
    // Thin-index fallback before enrichment fills armorType.
    if (type === "equipment" && /mail|plate|breastplate|chain|splint|scale|helmet|shield/i.test(name)) {
      return true;
    }
    void item;
    return false;
  }

  #isMundaneSellable(item) {
    if (!item?.uuid || !item?.name) return false;
    if (!["weapon", "equipment", "consumable", "tool", "container", "loot"].includes(item.type)) {
      return false;
    }
    const rarity = String(item.rarity ?? "").toLowerCase();
    if (rarity && !["", "common", "none"].includes(rarity)) return false;
    if (item.magical) return false;
    if (/\+\s*[1-3]|legendary|artifact|very rare|\buncommon\b|\brare\b|\bmagic\b/i.test(item.name)) {
      return false;
    }
    if (item.valueGP > 5000) return false;
    // Skip unpriced catalog oddities for automatic stock.
    if (!(item.valueCP > 0)) return false;
    return true;
  }

  async #loadItemIndex() {
    const { packs, selectedIds, missingIds } = resolveSelectedItemPacks();
    if (missingIds.length) {
      console.warn(
        `${LOG_PREFIX} Ignoring removed/unavailable shop source pack(s):`,
        missingIds.join(", ")
      );
    }
    if (!selectedIds.length || !packs.length) return [];

    const cacheKey = selectedIds.join("|");
    if (this.#packIndexCache.has(cacheKey)) return this.#packIndexCache.get(cacheKey);

    const index = [];
    for (const pack of packs) {
      try {
        let entries;
        let thin = false;
        try {
          entries = await pack.getIndex({
            fields: [
              "name",
              "img",
              "type",
              "system.price",
              "system.rarity",
              "system.type",
              "system.properties",
              "system.armor.type",
              "system.weaponType"
            ]
          });
        } catch (_error) {
          entries = await pack.getIndex();
          thin = true;
        }
        for (const entry of entries) {
          const normalized = this.#normalizeIndexEntry(entry, pack);
          normalized.thin = thin || !entry.system;
          index.push(normalized);
        }
      } catch (error) {
        console.warn(`${LOG_PREFIX} Failed indexing pack ${pack.collection}`, error);
      }
    }

    this.#packIndexCache.set(cacheKey, index);
    console.log(
      `${LOG_PREFIX} Indexed ${index.length} item(s) from ${packs.length} selected source pack(s)`
    );
    return index;
  }

  async #ensureIndexDetails(item) {
    if (!item.thin && item.valueCP > 0) return item;
    try {
      const doc = await fromUuid(item.uuid);
      if (!doc) return null;
      const pack = game.packs.get(item.pack);
      const data = typeof doc.toObject === "function" ? doc.toObject() : doc;
      data.uuid = item.uuid;
      data._id = item.id;
      const enriched = this.#normalizeIndexEntry(data, pack ?? { collection: item.pack });
      enriched.thin = false;
      return enriched;
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed enriching item ${item.uuid}`, error);
      return null;
    }
  }

  #normalizeIndexEntry(entry, pack) {
    const price = entry.system?.price ?? {};
    const value = Number(price.value ?? 0) || 0;
    const denom = String(price.denomination ?? "gp");
    const valueCP = value * (COIN_CP[denom] ?? COIN_CP.gp);
    const valueGP = valueCP / 100;
    const properties = entry.system?.properties;
    const magical =
      (Array.isArray(properties) && properties.includes("mgc")) ||
      (properties && typeof properties === "object" && Boolean(properties.mgc));

    const typeValue = entry.system?.type?.value ?? "";
    return {
      uuid: entry.uuid ?? `Compendium.${pack.collection}.${entry._id}`,
      id: entry._id,
      name: entry.name,
      img: entry.img,
      type: entry.type,
      pack: pack.collection,
      rarity: entry.system?.rarity ?? "",
      armorType: typeValue || entry.system?.armor?.type || "",
      weaponType: typeValue || entry.system?.weaponType || "",
      magical: Boolean(magical),
      valueCP,
      valueGP,
      thin: false
    };
  }

  #priceFromIndexItem(item, multiplier = 1) {
    return Math.max(1, Math.round(item.valueCP * Math.max(0.1, Number(multiplier) || 1)));
  }

  #priceFromItem(item, multiplier = 1) {
    const price = item.system?.price ?? {};
    const value = Number(price.value ?? 0) || 0;
    const denom = String(price.denomination ?? "gp");
    const valueCP = value * (COIN_CP[denom] ?? COIN_CP.gp);
    return Math.max(1, Math.round(valueCP * Math.max(0.1, Number(multiplier) || 1)));
  }

  #toStockEntry(item, { source, priceCP, quantity }) {
    const uuid = item.uuid;
    const id = `tfstock-${source}-${stableHash(uuid)}`;
    const unlimited = quantity == null || Number(quantity) < 0;
    const entry = {
      id,
      uuid,
      name: item.name,
      img: item.img || "icons/svg/item-bag.svg",
      type: item.type,
      priceCP,
      priceLabel: this.formatPrice(priceCP),
      source,
      pack: item.pack || "",
      filter: this.#filterBucket(item),
      unlimited
    };
    if (!unlimited) entry.quantity = Math.max(0, Math.floor(Number(quantity) || 0));
    return entry;
  }

  #filterBucket(item) {
    const type = item.type;
    const name = String(item.name ?? "").toLowerCase();
    const armorType = String(item.armorType ?? "").toLowerCase();

    if (type === "weapon") return "weapons";
    if (type === "equipment" && (armorType === "shield" || /shield/.test(name))) return "shields";
    if (type === "equipment") return "armor";
    if (type === "tool") return "tools";
    if (type === "container") return "containers";
    if (type === "consumable" && /potion|elixir|philter/i.test(name)) return "potions";
    if (/ingredient|component|herb|reagent/i.test(name)) return "ingredients";
    if (type === "consumable" || /ration|oil|torch|tinder|soap|feed/i.test(name)) return "supplies";
    return "gear";
  }
}

export const shopService = new ShopService();

export function getShopTypeLabel(shopType) {
  return SHOP_TYPES.find((entry) => entry.id === shopType)?.label ?? shopType;
}
