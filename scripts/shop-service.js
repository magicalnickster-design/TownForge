import { FLAGS, LOG_PREFIX, MODULE_ID } from "./constants.js";
import {
  COIN_CP,
  DND5E_ITEM_PACK_CANDIDATES,
  ECONOMY_TIERS,
  INVENTORY_MODES,
  OCCUPATION_SHOP_MAP,
  PARTY_LEVEL_MODES,
  SHOP_TYPES,
  SHOPKEEPER_FLAG,
  defaultShopkeeperFlags
} from "./shop-constants.js";

/**
 * TownForge shop generation, pricing, and purchase validation.
 *
 * Purchase security:
 * - Prices/stock are always read from Actor flags on the merchant
 * - Clients cannot invent stock entries or override prices
 * - Shop configuration mutations require GM permissions
 */
export class ShopService {
  /** @type {Map<string, object[]>} */
  #packIndexCache = new Map();

  /** @type {Set<string>} */
  #purchaseLocks = new Set();

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
    const generationKey = [
      shop.shopType,
      shop.economyTier,
      shop.partyLevelMode,
      partyLevel,
      shop.priceMultiplier,
      actor.id
    ].join("|");

    if (!force && shop.generationKey === generationKey && Array.isArray(shop.inventory)) {
      return shop;
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
   * @param {Actor} actor
   * @returns {object[]}
   */
  getSellableInventory(actor) {
    const shop = this.getShopkeeper(actor);
    if (!shop.enabled) return [];
    return (shop.inventory ?? []).filter((entry) => {
      if (!entry?.id || !entry?.uuid || !entry?.name) return false;
      if (entry.quantity == null) return true;
      return Number(entry.quantity) > 0;
    });
  }

  /**
   * Authoritative purchase validation + fulfillment.
   * Player may only mutate their own Actor; merchant stock updates require GM.
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
      const merchant = await fromUuid(request.merchantUuid);
      const buyer = await fromUuid(request.buyerUuid);
      if (!merchant || merchant.documentName !== "Actor") {
        return { ok: false, message: "Merchant not found." };
      }
      if (!buyer || buyer.documentName !== "Actor") {
        return { ok: false, message: "Buyer not found." };
      }

      if (!buyer.isOwner) {
        return { ok: false, message: "You do not own that character." };
      }
      if (buyer.type !== "character") {
        return { ok: false, message: "Buyer must be a player character." };
      }

      const shop = this.getShopkeeper(merchant);
      if (!shop.enabled) {
        return { ok: false, message: "This shopkeeper is not open for business." };
      }

      // Always re-read stock from merchant flags — never trust client item/price payloads.
      const stock = (shop.inventory ?? []).find((entry) => entry.id === request.stockId);
      if (!stock) {
        return { ok: false, message: "That item is not in this shop's stock." };
      }
      if (stock.quantity != null && Number(stock.quantity) <= 0) {
        return { ok: false, message: "That item is out of stock." };
      }

      const priceCP = Math.max(0, Number(stock.priceCP) || 0);
      if (!priceCP) {
        return { ok: false, message: "That item has an invalid price." };
      }

      const currency = foundry.utils.deepClone(buyer.system?.currency ?? {});
      const totalCP = this.currencyToCopper(currency);
      if (totalCP < priceCP) {
        return { ok: false, message: "Insufficient funds." };
      }

      const sourceItem = await fromUuid(stock.uuid);
      if (!sourceItem || sourceItem.documentName !== "Item") {
        return { ok: false, message: "Source item no longer exists." };
      }

      const nextCurrency = this.deductCopper(currency, priceCP);
      const itemData = sourceItem.toObject();
      delete itemData._id;
      itemData.name = stock.name || itemData.name;
      if (stock.img) itemData.img = stock.img;
      if (itemData.system && "quantity" in itemData.system) {
        itemData.system.quantity = 1;
      }

      await buyer.update({ "system.currency": nextCurrency });
      await buyer.createEmbeddedDocuments("Item", [itemData]);

      if (stock.quantity != null && merchant.isOwner) {
        const inventory = (shop.inventory ?? []).map((entry) => {
          if (entry.id !== stock.id) return entry;
          return { ...entry, quantity: Math.max(0, Number(entry.quantity) - 1) };
        });
        await this.updateShopkeeper(merchant, { inventory }, { allowNonGM: true });
      } else if (stock.quantity != null && !merchant.isOwner) {
        this.#emitStockDecrement(merchant.uuid, stock.id);
      }

      console.log(
        `${LOG_PREFIX} Purchase OK: ${buyer.name} bought ${stock.name} for ${priceCP} cp from ${merchant.name}`
      );
      return { ok: true, message: `Purchased ${stock.name}.` };
    } catch (error) {
      console.error(`${LOG_PREFIX} Purchase failed`, error);
      return { ok: false, message: "Purchase failed." };
    } finally {
      this.#purchaseLocks.delete(lockKey);
    }
  }

  /**
   * @param {object} currency
   * @returns {number}
   */
  currencyToCopper(currency = {}) {
    return Object.entries(COIN_CP).reduce((sum, [denom, value]) => {
      return sum + (Number(currency[denom]) || 0) * value;
    }, 0);
  }

  /**
   * Deduct copper-equivalent, then rebuild denominations largest-first.
   * Note: this may convert mixed coin piles into a normalized purse.
   * @param {object} currency
   * @param {number} priceCP
   * @returns {object}
   */
  deductCopper(currency, priceCP) {
    let remaining = this.currencyToCopper(currency) - priceCP;
    if (remaining < 0) throw new Error("Insufficient funds");

    const next = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
    for (const denom of ["pp", "gp", "ep", "sp", "cp"]) {
      const coinValue = COIN_CP[denom];
      next[denom] = Math.floor(remaining / coinValue);
      remaining -= next[denom] * coinValue;
    }
    return next;
  }

  /**
   * Format copper as a compact gp-focused label.
   * @param {number} priceCP
   * @returns {string}
   */
  formatPrice(priceCP) {
    const gp = Math.floor(priceCP / 100);
    const sp = Math.floor((priceCP % 100) / 10);
    const cp = priceCP % 10;
    const parts = [];
    if (gp) parts.push(`${gp} gp`);
    if (sp) parts.push(`${sp} sp`);
    if (cp || !parts.length) parts.push(`${cp} cp`);
    return parts.join(", ");
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
      if (payload.type === "stockDecrement" && game.user.isGM) {
        void this.#handleStockDecrement(payload);
      }
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

  async #generateAutomaticStock(actor, shop, partyLevel, economy) {
    const index = await this.#loadItemIndex();
    if (!index.length) {
      ui.notifications?.warn("TownForge could not find dnd5e item compendiums for shop stock.");
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
    const packs = this.#resolveItemPacks();
    if (!packs.length) return [];

    const cacheKey = packs.map((pack) => pack.collection).join("|");
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
    console.log(`${LOG_PREFIX} Indexed ${index.length} dnd5e item(s) from ${packs.length} pack(s)`);
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

  #resolveItemPacks() {
    const packs = [];
    for (const id of DND5E_ITEM_PACK_CANDIDATES) {
      const pack = game.packs.get(id);
      if (pack && pack.documentName === "Item") packs.push(pack);
    }

    if (packs.length) return packs;

    return [...game.packs].filter((pack) => {
      if (pack.metadata?.packageName !== "dnd5e") return false;
      if (pack.documentName !== "Item") return false;
      const key = `${pack.metadata.id} ${pack.metadata.label}`.toLowerCase();
      return /item|equipment|weapon|armor|trade/.test(key);
    });
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
    if (item.type === "weapon") return "weapons";
    if (item.type === "equipment") return "armor";
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
