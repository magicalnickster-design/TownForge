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
  { id: "stable", label: "Stable", ready: true, icon: "fa-solid fa-horse" },
  { id: "bookstore", label: "Bookstore", ready: true, icon: "fa-solid fa-book" },
  { id: "grocer", label: "Grocer", ready: true, icon: "fa-solid fa-wheat-awn" },
  { id: "shady-lender", label: "Shady Lender", ready: true, icon: "fa-solid fa-user-secret" }
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

export { PARTY_DETECTION_MODES } from "./shop-party.js";

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
    { id: "all", label: "All Apparel" },
    { id: "clothing", label: "Clothing" },
    { id: "light-armor", label: "Light Armor" },
    { id: "jewelry", label: "Jewelry" },
    { id: "footwear", label: "Footwear" },
    { id: "gloves", label: "Gloves" },
    { id: "outerwear", label: "Outerwear" },
    { id: "accessories", label: "Accessories" },
    { id: "formal", label: "Formal" },
    { id: "workwear", label: "Workwear" }
  ],
  stable: [
    { id: "all", label: "All" },
    { id: "gear", label: "Gear" },
    { id: "supplies", label: "Supplies" }
  ],
  bookstore: [
    { id: "all", label: "All Books" },
    { id: "magic", label: "Magic" },
    { id: "science", label: "Science" },
    { id: "history", label: "History" },
    { id: "religion", label: "Religion" },
    { id: "nature", label: "Nature" },
    { id: "creatures", label: "Creatures" },
    { id: "alchemy", label: "Alchemy" },
    { id: "law", label: "Law" },
    { id: "poetry", label: "Poetry" },
    { id: "adventure", label: "Adventure" }
  ],
  grocer: [
    { id: "all", label: "All Provisions" },
    { id: "grain", label: "Grains" },
    { id: "baked", label: "Baked" },
    { id: "preserved", label: "Preserved" },
    { id: "produce", label: "Produce" },
    { id: "hearty", label: "Hearty" },
    { id: "drink", label: "Drinks" },
    { id: "travel", label: "Travel" },
    { id: "provisions", label: "Provisions" }
  ],
  "shady-lender": [
    { id: "all", label: "All Goods" },
    { id: "infiltration", label: "Infiltration" },
    { id: "restraints", label: "Restraints" },
    { id: "tools", label: "Tools" },
    { id: "disguise", label: "Disguise" },
    { id: "documents", label: "Documents" },
    { id: "poison", label: "Poison" },
    { id: "gear", label: "Gear" }
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
  { shopType: "bookstore", keywords: ["bookstore", "bookshop", "bookseller", "bookstore owner"] },
  { shopType: "grocer", keywords: ["grain dealer", "grain", "grocer", "provisions", "baker", "butcher"] },
  { shopType: "shady-lender", keywords: ["moneylender", "money lender", "loan", "credit", "debt", "fence"] },
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
      partyAwareInventory: false,
      partyDetectionMode: "auto",
      partyActorUuids: [],
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
  merged.partyAwareInventory = Boolean(merged.partyAwareInventory);
  merged.partyDetectionMode =
    merged.partyDetectionMode === "manual" ? "manual" : "auto";
  merged.partyActorUuids = Array.isArray(merged.partyActorUuids)
    ? [...new Set(merged.partyActorUuids.map((id) => String(id || "").trim()).filter(Boolean))]
    : [];
  return merged;
}

/** Unlimited stock helpers. Prefer `unlimited: true` over quantity null. */
export function isUnlimitedStock(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.unlimited === true) return true;
  if (entry.quantity == null) return true;
  return Number(entry.quantity) < 0;
}

export function stockQuantityLabel(entry) {
  return isUnlimitedStock(entry) ? "∞" : String(Math.max(0, Number(entry.quantity) || 0));
}

const RARITY_ALIASES = Object.freeze({
  common: "common",
  none: "common",
  "": "common",
  uncommon: "uncommon",
  rare: "rare",
  veryrare: "veryRare",
  legendary: "legendary",
  artifact: "artifact"
});

/**
 * Normalize dnd5e rarity strings for CSS classes and hover cards.
 * @param {unknown} value
 * @returns {"common"|"uncommon"|"rare"|"veryRare"|"legendary"|"artifact"}
 */
export function normalizeRarity(value) {
  const raw = value && typeof value === "object" ? value.value ?? value.label ?? "" : value;
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  return RARITY_ALIASES[key] ?? "common";
}

export const RARITY_LABELS = Object.freeze({
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  veryRare: "Very Rare",
  legendary: "Legendary",
  artifact: "Artifact"
});

export function rarityLabel(value) {
  return RARITY_LABELS[normalizeRarity(value)] ?? "Common";
}

/**
 * Compact quantity overlay for icon cells. Empty when a single mundane stack.
 * @param {object} entry
 * @returns {string}
 */
export function itemQtyBadge(entry) {
  if (isUnlimitedStock(entry)) return "∞";
  const qty = Math.max(0, Number(entry.quantity) || 0);
  if (qty === 1) return "";
  return String(qty);
}

/** Items that must never appear in merchant buy/sell flows. */
export function isShopTradeableItem(item) {
  if (!item) return false;
  const name = String(item.name ?? "").trim().toLowerCase();
  if (name === "unarmed strike") return false;

  const weaponType = String(
    item.weaponType ?? item.system?.type?.value ?? item.system?.weaponType ?? ""
  ).toLowerCase();
  if (weaponType === "natural") return false;

  return true;
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

/** Stable identity for collapsing duplicate catalog rows (same name/type, different UUID). */
export function stockIdentityKey(entry) {
  const type = String(entry?.type ?? "item").trim().toLowerCase();
  const name = String(entry?.name ?? "").trim().toLowerCase();
  return `${type}|${name}`;
}

/**
 * Remove duplicate shop rows. Manual entries win over automatic ones.
 * @param {object[]} inventory
 * @returns {object[]}
 */
export function dedupeStockEntries(inventory) {
  const rows = (Array.isArray(inventory) ? inventory : [])
    .filter((entry) => entry?.uuid && entry?.name)
    .slice()
    .sort((a, b) => {
      if (a.source === "manual" && b.source !== "manual") return -1;
      if (b.source === "manual" && a.source !== "manual") return 1;
      return 0;
    });

  const seenUuid = new Set();
  const seenIdentity = new Set();
  const result = [];

  for (const entry of rows) {
    const uuid = String(entry.uuid);
    const identity = stockIdentityKey(entry);
    if (seenUuid.has(uuid) || seenIdentity.has(identity)) continue;
    seenUuid.add(uuid);
    seenIdentity.add(identity);
    result.push(entry);
  }

  return result;
}

export function shopkeeperFlagPath(...parts) {
  return [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}`, ...parts].join(".");
}
