import { FLAGS, LOG_PREFIX, MODULE_ID } from "./constants.js";
import {
  currencyToCopper as currencyToCopperPure,
  deductCopper as deductCopperPure,
  formatCopper,
  formatWallet,
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
  defaultShopkeeperFlags
} from "./shop-constants.js";
import { resolveSelectedItemPacks } from "./shop-sources.js";

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
    return defaultShopkeeperFlags(raw);
  }

  /**
   * @param {Actor} actor
   * @param {object} patch
   * @param {{allowNonGM?: boolean}} [options]
   * @returns {Promise<object>}
   */
  async updateShopkeeper(actor, patch, options = {}) {
    if (!actor) throw new Error("Missing merchant actor");
    if (!options.allowNonGM && !game.user?.isGM) {
      throw new Error("Only the GM can modify TownForge shopkeeper settings.");
    }
    const current = this.getShopkeeper(actor);
    const next = foundry.utils.mergeObject(current, patch, { inplace: false });
    next.priceMultiplier = Math.max(0.1, Number(next.priceMultiplier) || 1);
    if (next.fixedPartyLevel != null) {
      next.fixedPartyLevel = Math.max(1, Math.min(20, Number(next.fixedPartyLevel) || 1));
    }
    if (!Array.isArray(next.inventory)) next.inventory = [];
    await actor.setFlag(MODULE_ID, SHOPKEEPER_FLAG, next);
    return this.getShopkeeper(actor);
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

    if (enabled.inventoryMode === INVENTORY_MODES.automatic) {
      return this.regenerateInventory(actor, { force: true });
    }
    return enabled;
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
   * Regenerate automatic stock, preserving manual entries.
   * @param {Actor} actor
   * @param {{force?: boolean}} [options]
   * @returns {Promise<object>}
   */
  async regenerateInventory(actor, { force = false } = {}) {
    if (!game.user?.isGM) {
      console.warn(`${LOG_PREFIX} Ignoring inventory regenerate from non-GM user`);
      return this.getShopkeeper(actor);
    }

    const shop = this.getShopkeeper(actor);
    if (!shop.enabled && !force) return shop;

    const partyLevel = this.getEffectivePartyLevel(shop);
    const economy = ECONOMY_TIERS[shop.economyTier] ?? ECONOMY_TIERS.standard;
    const { selectedIds } = resolveSelectedItemPacks();
    const generationKey = [
      shop.shopType,
      shop.economyTier,
      shop.partyLevelMode,
      partyLevel,
      shop.priceMultiplier,
      selectedIds.join(","),
      actor.id
    ].join("|");

    if (!force && shop.generationKey === generationKey && Array.isArray(shop.inventory)) {
      return shop;
    }

    if (!selectedIds.length) {
      ui.notifications?.warn(
        "TownForge has no Shopkeeper Item Sources selected. Open Configure Settings → Module Settings → TownForge → Shopkeeper Item Sources."
      );
      console.warn(`${LOG_PREFIX} Shop inventory generation blocked: no item sources selected`);
      return this.updateShopkeeper(actor, {
        inventory: (shop.inventory ?? []).filter((entry) => entry?.source === "manual"),
        generatedAt: Date.now(),
        generationKey
      });
    }

    const manual = (shop.inventory ?? []).filter((entry) => entry?.source === "manual");
    const automatic = await this.#generateAutomaticStock(actor, shop, partyLevel, economy);
    const inventory = [...automatic, ...manual];

    console.log(
      `${LOG_PREFIX} Generated ${automatic.length} automatic stock item(s) for ${actor.name} (${shop.shopType}, lvl ${partyLevel}, ${economy.id})`
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
      if (entry.quantity == null) return true;
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
    if (!stock?.uuid) return "";
    const cached = this.#detailCache.get(stock.uuid);
    if (cached && Date.now() - cached.loadedAt < 5 * 60 * 1000) {
      return cached.description;
    }
    try {
      const item = await fromUuid(stock.uuid);
      const raw =
        item?.system?.description?.value ??
        item?.system?.description ??
        item?.system?.unidentified?.description ??
        "";
      const description = this.#stripHtml(String(raw)).slice(0, 600);
      this.#detailCache.set(stock.uuid, { description, loadedAt: Date.now() });
      return description;
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed loading item detail for ${stock.uuid}`, error);
      return "";
    }
  }

  /**
   * Entry point for UI purchases.
   * Players prefer GM-authoritative fulfillment via socket.
   * @param {{merchantUuid: string, buyerUuid: string, stockId: string}} request
   * @returns {Promise<{ok: boolean, message?: string}>}
   */
  async purchaseItem(request) {
    const lockKey = `${request.merchantUuid}:${request.buyerUuid}:${request.stockId}`;
    if (this.#purchaseLocks.has(lockKey)) {
      return { ok: false, message: "Purchase already in progress." };
    }
    this.#purchaseLocks.add(lockKey);

    try {
      // Ignore any client-supplied price/uuid fields if present.
      const clean = {
        merchantUuid: String(request.merchantUuid || ""),
        buyerUuid: String(request.buyerUuid || ""),
        stockId: String(request.stockId || "")
      };

      if (game.user?.isGM) {
        return await this.#fulfillPurchase(clean, game.user.id);
      }

      const activeGM = game.users?.find((user) => user.isGM && user.active);
      if (activeGM) {
        return await this.#requestPurchaseViaSocket(clean);
      }

      // No GM online: allow self-fulfill only when merchant flags need no mutation,
      // or the player owns the merchant Actor.
      const merchant = await fromUuid(clean.merchantUuid);
      const shop = merchant ? this.getShopkeeper(merchant) : null;
      const stock = (shop?.inventory ?? []).find((entry) => entry.id === clean.stockId);
      const needsStockMutation = stock && stock.quantity != null;
      if (needsStockMutation && !merchant?.isOwner) {
        return {
          ok: false,
          message: "Shop unavailable."
        };
      }
      return await this.#fulfillPurchase(clean, game.user.id);
    } finally {
      this.#purchaseLocks.delete(lockKey);
    }
  }

  /**
   * Authoritative purchase fulfillment (GM or permitted local owner).
   * @param {{merchantUuid:string,buyerUuid:string,stockId:string}} request
   * @param {string} requesterId
   * @returns {Promise<{ok:boolean,message?:string}>}
   */
  async #fulfillPurchase(request, requesterId) {
    const fulfillKey = `fulfill:${request.merchantUuid}:${request.stockId}`;
    if (this.#purchaseLocks.has(fulfillKey)) {
      return { ok: false, message: "Purchase already in progress." };
    }
    this.#purchaseLocks.add(fulfillKey);

    try {
      const merchant = await fromUuid(request.merchantUuid);
      const buyer = await fromUuid(request.buyerUuid);
      if (!merchant || merchant.documentName !== "Actor") {
        return { ok: false, message: "Shop unavailable." };
      }
      if (!buyer || buyer.documentName !== "Actor") {
        return { ok: false, message: "Character not selected." };
      }

      const requester = game.users?.get(requesterId);
      if (!requester) {
        return { ok: false, message: "Character not selected." };
      }

      const owned = this.#userOwnsActor(requester, buyer);
      if (!owned) {
        return { ok: false, message: "Character not selected." };
      }

      const shop = this.getShopkeeper(merchant);
      const check = validatePurchaseRequest({
        shop,
        stockId: request.stockId,
        buyerOwned: true,
        buyerType: buyer.type,
        buyerCurrency: buyer.system?.currency ?? {},
        clientPriceCP: request.priceCP,
        clientUuid: request.uuid
      });
      if (!check.ok) return { ok: false, message: check.message };

      const stock = check.stock;
      const priceCP = check.priceCP;

      // Resolve source BEFORE charging currency.
      const sourceItem = await fromUuid(stock.uuid);
      if (!sourceItem || sourceItem.documentName !== "Item") {
        console.warn(`${LOG_PREFIX} Shop item source could not be resolved`, stock.uuid);
        return { ok: false, message: "Item unavailable." };
      }

      // Re-check stock after async gap (finite inventory race).
      const latestShop = this.getShopkeeper(merchant);
      if (!latestShop.enabled) {
        return { ok: false, message: "Shop unavailable." };
      }
      const latestStock = (latestShop.inventory ?? []).find((entry) => entry.id === stock.id);
      if (!latestStock) {
        return { ok: false, message: "Item unavailable." };
      }
      if (latestStock.quantity != null && Number(latestStock.quantity) <= 0) {
        return { ok: false, message: "Item sold out." };
      }

      const currency = foundry.utils.deepClone(buyer.system?.currency ?? {});
      if (this.currencyToCopper(currency) < priceCP) {
        return { ok: false, message: "Not enough gold." };
      }
      const nextCurrency = this.deductCopper(currency, priceCP);
      const itemData = sourceItem.toObject();
      delete itemData._id;
      // Preserve full dnd5e item data; only normalize purchased quantity to 1.
      if (itemData.system && "quantity" in itemData.system) {
        itemData.system.quantity = 1;
      }

      await buyer.update({ "system.currency": nextCurrency });
      await buyer.createEmbeddedDocuments("Item", [itemData]);

      if (latestStock.quantity != null) {
        if (game.user.isGM || merchant.isOwner) {
          const inventory = (latestShop.inventory ?? []).map((entry) => {
            if (entry.id !== latestStock.id) return entry;
            return { ...entry, quantity: Math.max(0, Number(entry.quantity) - 1) };
          });
          await this.updateShopkeeper(
            merchant,
            { inventory },
            { allowNonGM: Boolean(merchant.isOwner) }
          );
        } else {
          this.#emitStockDecrement(merchant.uuid, latestStock.id);
        }
      }

      const priceLabel = this.formatPrice(priceCP);
      console.log(
        `${LOG_PREFIX} Purchase OK: ${buyer.name} bought ${latestStock.name} for ${priceCP} cp from ${merchant.name}`
      );
      return { ok: true, message: `Purchased ${latestStock.name} for ${priceLabel}.` };
    } catch (error) {
      console.error(`${LOG_PREFIX} Purchase failed`, error);
      return { ok: false, message: "Purchase failed." };
    } finally {
      this.#purchaseLocks.delete(fulfillKey);
    }
  }

  /**
   * Ask the active GM to fulfill a purchase authoritatively.
   * @param {{merchantUuid:string,buyerUuid:string,stockId:string}} request
   */
  #requestPurchaseViaSocket(request) {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.#pendingPurchases.delete(requestId);
        resolve({ ok: false, message: "Shop unavailable." });
      }, 15000);

      this.#pendingPurchases.set(requestId, { resolve, timeout });
      game.socket.emit(`module.${MODULE_ID}`, {
        type: "purchaseRequest",
        requestId,
        userId: game.user.id,
        merchantUuid: request.merchantUuid,
        buyerUuid: request.buyerUuid,
        stockId: request.stockId
      });
    });
  }

  currencyToCopper(currency = {}) {
    return currencyToCopperPure(currency);
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
        next.quantity = patch.quantity == null ? null : Math.max(0, Number(patch.quantity) || 0);
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
    return this.regenerateInventory(merchant, { force: true });
  }

  registerSockets() {
    game.socket.on(`module.${MODULE_ID}`, (payload) => {
      if (!payload || typeof payload !== "object") return;

      if (payload.type === "purchaseRequest" && game.user.isGM) {
        void this.#handlePurchaseRequest(payload);
        return;
      }

      if (payload.type === "purchaseResult") {
        const pending = this.#pendingPurchases.get(payload.requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.#pendingPurchases.delete(payload.requestId);
        pending.resolve({
          ok: Boolean(payload.ok),
          message: payload.message || (payload.ok ? "Purchase complete." : "Purchase failed.")
        });
        return;
      }

      if (payload.type === "stockDecrement" && game.user.isGM) {
        void this.#handleStockDecrement(payload);
      }
    });
  }

  async #handlePurchaseRequest(payload) {
    if (!game.user.isActiveGM) return;
    const result = await this.#fulfillPurchase(
      {
        merchantUuid: payload.merchantUuid,
        buyerUuid: payload.buyerUuid,
        stockId: payload.stockId
      },
      payload.userId
    );
    game.socket.emit(`module.${MODULE_ID}`, {
      type: "purchaseResult",
      requestId: payload.requestId,
      ok: result.ok,
      message: result.message
    });
  }

  #emitStockDecrement(merchantUuid, stockId) {
    game.socket.emit(`module.${MODULE_ID}`, {
      type: "stockDecrement",
      merchantUuid,
      stockId
    });
  }

  async #handleStockDecrement(payload) {
    if (!game.user.isActiveGM) return;
    const merchant = await fromUuid(payload.merchantUuid);
    if (!merchant) return;
    const shop = this.getShopkeeper(merchant);
    const inventory = (shop.inventory ?? []).map((entry) => {
      if (entry.id !== payload.stockId || entry.quantity == null) return entry;
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

  async #generateAutomaticStock(actor, shop, partyLevel, economy) {
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
    const stretchCount = Math.floor(economy.stockCount * economy.expensiveChance);
    const seededStretch = this.#seededPick(
      stretch,
      stretchCount,
      `${actor.id}:${shop.shopType}:stretch:${partyLevel}`
    );
    pool.push(...seededStretch);

    const unique = new Map();
    for (const item of pool) unique.set(item.uuid, item);

    const picked = this.#seededPick(
      [...unique.values()],
      economy.stockCount,
      `${actor.id}:${shop.shopType}:${economy.id}:${partyLevel}`
    );

    if (shop.shopType === "blacksmith" || shop.shopType === "armorer") {
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
        economy.stockCount
      );
    }

    return picked.map((item) =>
      this.#toStockEntry(item, {
        source: "automatic",
        priceCP: this.#priceFromIndexItem(item, shop.priceMultiplier),
        quantity: null
      })
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
    const id = `tfstock-${source}-${this.#stableHash(uuid)}`;
    return {
      id,
      uuid,
      name: item.name,
      img: item.img || "icons/svg/item-bag.svg",
      type: item.type,
      priceCP,
      priceLabel: this.formatPrice(priceCP),
      quantity,
      source,
      pack: item.pack || "",
      filter: this.#filterBucket(item)
    };
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

  #seededPick(list, count, seedText) {
    if (!list.length || count <= 0) return [];
    const arr = list.slice();
    let seed = this.#stableHash(seedText);
    // Convert hex hash string to numeric seed.
    if (typeof seed === "string") {
      seed = Number.parseInt(seed.slice(0, 8), 16) || 1;
    }
    const rand = () => {
      seed = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, Math.min(count, arr.length));
  }

  #stableHash(text) {
    let hash = 2166136261;
    const str = String(text ?? "");
    for (let i = 0; i < str.length; i += 1) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }
}

export const shopService = new ShopService();

export function getShopTypeLabel(shopType) {
  return SHOP_TYPES.find((entry) => entry.id === shopType)?.label ?? shopType;
}
