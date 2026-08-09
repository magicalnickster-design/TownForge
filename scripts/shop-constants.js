import { MODULE_ID } from "./constants.js";

export const SHOPKEEPER_FLAG = "shopkeeper";

export const SHOP_TYPES = Object.freeze([
  { id: "blacksmith", label: "Blacksmith", ready: true },
  { id: "armorer", label: "Armorer", ready: true },
  { id: "general-store", label: "General Store", ready: true },
  { id: "adventuring-supplies", label: "Adventuring Supplies", ready: true },
  { id: "alchemist", label: "Alchemist", ready: true },
  { id: "inn", label: "Inn", ready: true },
  { id: "temple", label: "Temple", ready: true },
  { id: "tailor", label: "Tailor", ready: true },
  { id: "stable", label: "Stable", ready: true }
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
export const COIN_CP = Object.freeze({
  pp: 1000,
  gp: 100,
  ep: 50,
  sp: 10,
  cp: 1
});

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

export function defaultShopkeeperFlags(overrides = {}) {
  return foundry.utils.mergeObject(
    {
      enabled: false,
      shopType: "general-store",
      shopName: "",
      inventoryMode: INVENTORY_MODES.automatic,
      economyTier: "standard",
      partyLevelMode: PARTY_LEVEL_MODES.auto,
      fixedPartyLevel: null,
      priceMultiplier: 1,
      stockModel: "unlimited",
      generatedAt: null,
      generationKey: null,
      inventory: []
    },
    overrides,
    { inplace: false }
  );
}

export function shopkeeperFlagPath(...parts) {
  return [`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}`, ...parts].join(".");
}
