import { MODULE_ID } from "./constants.js";

export const SHOPKEEPER_FLAG = "shopkeeper";

export const SHOP_TYPES = Object.freeze([
  { id: "blacksmith", label: "Blacksmith", ready: true, icon: "fa-solid fa-hammer" },
  { id: "armorer", label: "Armorer", ready: true, icon: "fa-solid fa-shield-halved" },
  { id: "general-store", label: "General", ready: true, icon: "fa-solid fa-box-open" },
  { id: "adventuring-supplies", label: "Adventuring", ready: true, icon: "fa-solid fa-compass" },
  { id: "alchemist", label: "Alchemist", ready: true, icon: "fa-solid fa-flask" },
  { id: "inn", label: "Inn", ready: true, icon: "fa-solid fa-mug-saucer" },
  { id: "temple", label: "Temple", ready: true, icon: "fa-solid fa-place-of-worship" },
  { id: "tailor", label: "Tailor", ready: true, icon: "fa-solid fa-scissors" },
  { id: "stable", label: "Stable", ready: true, icon: "fa-solid fa-horse" }
]);

export const ECONOMY_TIERS = Object.freeze({
  poor: {
    id: "poor",
    label: "Poor",
    stockCount: 10,
    maxValueGP: 40,
    expensiveChance: 0.05
  },
  standard: {
    id: "standard",
    label: "Standard",
    stockCount: 16,
    maxValueGP: 200,
    expensiveChance: 0.2
  },
  wealthy: {
    id: "wealthy",
    label: "Wealthy",
    stockCount: 22,
    maxValueGP: 2000,
    expensiveChance: 0.55
  }
});

export const INVENTORY_MODES = Object.freeze({
  automatic: "automatic",
  manual: "manual"
});

export const PARTY_LEVEL_MODES = Object.freeze({
  auto: "auto",
  fixed: "fixed"
});

/** Denomination values in copper pieces. */
export { COIN_CP, COIN_ORDER } from "./shop-currency.js";

/**
 * Candidate dnd5e Item pack ids across common system versions.
 * Lookup also falls back to packageName === "dnd5e" + documentName Item.
 */
export const DND5E_ITEM_PACK_CANDIDATES = Object.freeze([
  "dnd5e.items",
  "dnd5e.equipment24",
  "dnd5e.equipment",
  "dnd5e.tradegoods"
]);

/**
 * Shop-type filter tabs. Only tabs present in actual stock are shown in the UI.
 */
export const SHOP_FILTERS = Object.freeze({
  blacksmith: [
    { id: "all", label: "All" },
    { id: "weapons", label: "Weapons" },
    { id: "armor", label: "Armor" },
    { id: "shields", label: "Shields" },
    { id: "tools", label: "Tools" }
  ],
  armorer: [
    { id: "all", label: "All" },
    { id: "armor", label: "Armor" },
    { id: "shields", label: "Shields" }
  ],
  "general-store": [
    { id: "all", label: "All" },
    { id: "gear", label: "Adventuring Gear" },
    { id: "tools", label: "Tools" },
    { id: "containers", label: "Containers" },
    { id: "supplies", label: "Supplies" },
    { id: "weapons", label: "Weapons" },
    { id: "armor", label: "Armor" }
  ],
  "adventuring-supplies": [
    { id: "all", label: "All" },
    { id: "gear", label: "Adventuring Gear" },
    { id: "tools", label: "Tools" },
    { id: "supplies", label: "Supplies" },
    { id: "containers", label: "Containers" }
  ],
  alchemist: [
    { id: "all", label: "All" },
    { id: "potions", label: "Potions" },
    { id: "ingredients", label: "Ingredients" },
    { id: "supplies", label: "Supplies" },
    { id: "tools", label: "Tools" }
  ],
  inn: [
    { id: "all", label: "All" },
    { id: "supplies", label: "Supplies" },
    { id: "gear", label: "Gear" }
  ],
  temple: [
    { id: "all", label: "All" },
    { id: "potions", label: "Potions" },
    { id: "gear", label: "Gear" },
    { id: "supplies", label: "Supplies" }
  ],
  tailor: [
    { id: "all", label: "All" },
    { id: "armor", label: "Clothing / Armor" },
    { id: "gear", label: "Gear" }
  ],
  stable: [
    { id: "all", label: "All" },
    { id: "gear", label: "Gear" },
    { id: "supplies", label: "Supplies" }
  ]
});

/** Occupation keywords used to infer a default shop type. */
export const OCCUPATION_SHOP_MAP = Object.freeze([
  { shopType: "blacksmith", keywords: ["blacksmith", "smith", "weaponsmith", "forge"] },
  { shopType: "armorer", keywords: ["armorer", "armourer", "armor"] },
  { shopType: "alchemist", keywords: ["alchemist", "apothecary", "herbal"] },
  { shopType: "temple", keywords: ["priest", "priestess", "cleric", "temple", "acolyte", "chaplain"] },
  { shopType: "inn", keywords: ["innkeeper", "tavern", "barkeep", "bartender", "cook"] },
  { shopType: "tailor", keywords: ["tailor", "clothier", "weaver", "seamstress", "haberdasher"] },
  { shopType: "stable", keywords: ["stable", "ostler", "horse"] },
  { shopType: "adventuring-supplies", keywords: ["outfitter", "adventur", "guide"] },
  { shopType: "general-store", keywords: ["merchant", "shop", "general", "store", "trader", "chandler"] }
]);

/**
 * Coerce shop inventory to a real Array.
 * Foundry mergeObject() merges arrays by numeric index and can leave an
 * object-like `{0: item, 1: item}` instead of an Array. Callers that then
 * do `Array.isArray(inventory) ? inventory : []` would wipe the shelf.
 * @param {unknown} value
 * @returns {object[]}
 */
export function coerceInventoryArray(value) {
  if (Array.isArray(value)) return value.filter((row) => row && typeof row === "object");
  if (!value || typeof value !== "object") return [];
  return Object.keys(value)
    .filter((key) => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => value[key])
    .filter((row) => row && typeof row === "object");
}

export function defaultShopkeeperFlags(overrides = {}) {
  const source = foundry.utils.deepClone(overrides ?? {});
  // Never mergeObject() the inventory array: Foundry merges arrays by index
  // and can turn a real Array into an object-like `{0: item, 1: item}`.
  const savedInventory = source.inventory;
  delete source.inventory;
  const merged = foundry.utils.mergeObject(
    {
      enabled: false,
      shopType: "general-store",
      shopName: "",
      inventoryMode: INVENTORY_MODES.automatic,
      economyTier: "standard",
      partyLevelMode: PARTY_LEVEL_MODES.auto,
      fixedPartyLevel: null,
      priceMultiplier: 1,
      stockCount: 25,
      stockModel: "unlimited",
      generatedAt: null,
      generationKey: null,
      inventory: []
    },
    source,
    { inplace: false }
  );
  merged.inventory = coerceInventoryArray(savedInventory);
  return merged;
}

/**
 * Unlimited stock marker helpers.
 * Never persist quantity: null — Foundry treats null as "delete key" in updates,
 * which can wipe shop inventory when players write stock after a trade.
 */
export function isUnlimitedStock(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.unlimited === true) return true;
  if (entry.quantity == null) return true;
  return Number(entry.quantity) < 0;
}

export function stockQuantityLabel(entry) {
  return isUnlimitedStock(entry) ? "∞" : String(Math.max(0, Number(entry.quantity) || 0));
}

/**
 * @param {object} entry
 * @returns {object}
 */
export function sanitizeStockEntry(entry) {
  if (!entry || typeof entry !== "object") return entry;
  const next = { ...entry };
  if (isUnlimitedStock(next)) {
    next.unlimited = true;
    delete next.quantity;
  } else {
    next.unlimited = false;
    next.quantity = Math.max(0, Math.floor(Number(next.quantity) || 0));
  }
  return next;
}

export function shopkeeperFlagPath(...parts) {
  return [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}`, ...parts].join(".");
}
