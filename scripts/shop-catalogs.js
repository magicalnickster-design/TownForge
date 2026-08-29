import { FLAGS, MODULE_ID } from "./constants.js";
import { findCompendiumItemByName, listCandidatePacks } from "./compendium-resolver.js";
import { stableHash } from "./shop-random.js";
import {
  APPAREL_UUID_PREFIX,
  inferApparelTopic,
  isApparelIndexRow,
  isApparelRelatedName,
  isApparelRelatedShopEntry,
  rowArmorType
} from "./shop-apparel.js";
import {
  DEFAULT_COMPENDIUM_BOOK_ITEMS,
  isBookRelatedName,
  isBookRelatedShopEntry
} from "./shop-books.js";
import {
  DEFAULT_COMPENDIUM_FOOD_ITEMS,
  FOOD_UUID_PREFIX,
  inferFoodTopic,
  isFoodRelatedName,
  isFoodRelatedShopEntry
} from "./shop-foods.js";

const CATALOG_ROOT = `modules/${MODULE_ID}/data/shop-catalogs`;
const BOOK_UUID_PREFIX = "townforge-book:";

/** @type {Map<string, object>} */
const catalogByNpcId = new Map();

/** @type {Map<string, object>} */
const bookById = new Map();

/** @type {Map<string, object>} */
const foodById = new Map();

/** @type {Map<string, object>} */
const apparelById = new Map();

/** @type {Promise<void>|null} */
let loadPromise = null;

export function townforgeBookUuid(bookId) {
  return `${BOOK_UUID_PREFIX}${bookId}`;
}

export function townforgeFoodUuid(foodId) {
  return `${FOOD_UUID_PREFIX}${foodId}`;
}

export function townforgeApparelUuid(apparelId) {
  return `${APPAREL_UUID_PREFIX}${apparelId}`;
}

export function parseTownforgeBookUuid(uuid) {
  const text = String(uuid ?? "");
  if (!text.startsWith(BOOK_UUID_PREFIX)) return null;
  return text.slice(BOOK_UUID_PREFIX.length);
}

export function parseTownforgeFoodUuid(uuid) {
  const text = String(uuid ?? "");
  if (!text.startsWith(FOOD_UUID_PREFIX)) return null;
  return text.slice(FOOD_UUID_PREFIX.length);
}

export function parseTownforgeApparelUuid(uuid) {
  const text = String(uuid ?? "");
  if (!text.startsWith(APPAREL_UUID_PREFIX)) return null;
  return text.slice(APPAREL_UUID_PREFIX.length);
}

export function isTownforgeBookUuid(uuid) {
  return String(uuid ?? "").startsWith(BOOK_UUID_PREFIX);
}

export function isTownforgeFoodUuid(uuid) {
  return String(uuid ?? "").startsWith(FOOD_UUID_PREFIX);
}

export function isFoodCatalog(catalog) {
  return catalog?.catalogKind === "food" || catalog?.shopType === "grocer";
}

export function isApparelCatalog(catalog) {
  return catalog?.catalogKind === "apparel" || catalog?.shopType === "tailor";
}

/**
 * @param {object} [catalog]
 * @returns {(entry: object|string) => boolean}
 */
export function getCatalogEntryValidator(catalog) {
  if (isFoodCatalog(catalog)) return isFoodRelatedShopEntry;
  if (isApparelCatalog(catalog)) return isApparelRelatedShopEntry;
  return isBookRelatedShopEntry;
}

/**
 * @param {Actor} actor
 * @returns {string|null}
 */
export function getActorNpcId(actor) {
  return actor?.getFlag?.(MODULE_ID, FLAGS.NPC_ID) ?? null;
}

/**
 * @param {string} npcId
 * @returns {object|null}
 */
export function getLoadedCatalog(npcId) {
  return catalogByNpcId.get(npcId) ?? null;
}

/**
 * @param {string} bookId
 * @returns {object|null}
 */
export function getCatalogBook(bookId) {
  return bookById.get(bookId) ?? null;
}

/**
 * @param {string} foodId
 * @returns {object|null}
 */
export function getCatalogFood(foodId) {
  return foodById.get(foodId) ?? null;
}

/**
 * @param {string} apparelId
 * @returns {object|null}
 */
export function getCatalogApparel(apparelId) {
  return apparelById.get(apparelId) ?? null;
}

export async function readyShopCatalogs() {
  if (!loadPromise) loadPromise = loadAllCatalogs();
  await loadPromise;
}

async function loadAllCatalogs() {
  try {
    const manifestRes = await fetch(`${CATALOG_ROOT}/manifest.json`);
    if (!manifestRes.ok) return;
    const manifest = await manifestRes.json();
    for (const entry of manifest.catalogs ?? []) {
      const fileRes = await fetch(`${CATALOG_ROOT}/${entry.file}`);
      if (!fileRes.ok) continue;
      const catalog = await fileRes.json();
      catalogByNpcId.set(catalog.npcId, catalog);
      for (const book of catalog.books ?? []) {
        bookById.set(book.id, { ...book, catalogId: catalog.id });
      }
      for (const food of catalog.foods ?? []) {
        foodById.set(food.id, { ...food, catalogId: catalog.id });
      }
      for (const piece of catalog.apparel ?? []) {
        apparelById.set(piece.id, { ...piece, catalogId: catalog.id });
      }
    }
  } catch (error) {
    console.warn("[TownForge] Failed loading shop catalogs", error);
  }
}

/**
 * @param {string} npcId
 * @returns {Promise<object|null>}
 */
export async function resolveShopCatalog(npcId) {
  if (!npcId) return null;
  await readyShopCatalogs();
  return getLoadedCatalog(npcId);
}

/**
 * Build a dnd5e Item document shape for a TownForge catalog book.
 * @param {object} book
 * @returns {object}
 */
export function buildBookItemData(book) {
  const description = String(book.description ?? "").trim();
  return {
    name: book.name,
    type: "loot",
    img: book.img,
    system: {
      description: { value: description ? `<p>${description}</p>` : "" },
      quantity: 1,
      weight: 3,
      price: { value: Math.max(1, Number(book.priceGP) || 1), denomination: "gp" },
      rarity: "",
      identified: true
    },
    flags: {
      [MODULE_ID]: {
        catalogBook: true,
        catalogId: book.catalogId,
        bookId: book.id,
        topic: book.topic
      }
    }
  };
}

/**
 * Build a consumable food item with a passive effect in the description.
 * @param {object} food
 * @returns {object}
 */
export function buildFoodItemData(food) {
  const description = String(food.description ?? "").trim();
  const passive = String(food.passive ?? "").trim();
  const html = [
    description ? `<p>${description}</p>` : "",
    passive ? `<p><strong>Passive:</strong> ${passive}</p>` : ""
  ]
    .filter(Boolean)
    .join("");

  return {
    name: food.name,
    type: "consumable",
    img: food.img,
    system: {
      description: { value: html },
      quantity: 1,
      weight: { value: 1, units: "lb" },
      price: { value: Math.max(1, Number(food.priceGP) || 1), denomination: "gp" },
      rarity: "",
      identified: true,
      type: { value: "food" },
      uses: {
        max: 1,
        spent: 0,
        autoDestroy: true,
        recovery: []
      }
    },
    flags: {
      [MODULE_ID]: {
        catalogFood: true,
        catalogId: food.catalogId,
        foodId: food.id,
        topic: food.topic,
        passive
      }
    }
  };
}

/**
 * Build wearable equipment with a passive effect in the description.
 * @param {object} piece
 * @returns {object}
 */
export function buildApparelItemData(piece) {
  const description = String(piece.description ?? "").trim();
  const passive = String(piece.passive ?? "").trim();
  const html = [
    description ? `<p>${description}</p>` : "",
    passive ? `<p><strong>Passive:</strong> ${passive}</p>` : ""
  ]
    .filter(Boolean)
    .join("");
  const lightArmor = piece.topic === "light-armor" || Number(piece.ac) > 0;
  const armorType = lightArmor ? "light" : "clothing";

  return {
    name: piece.name,
    type: "equipment",
    img: piece.img,
    system: {
      description: { value: html },
      quantity: 1,
      weight: { value: lightArmor ? 10 : 1, units: "lb" },
      price: { value: Math.max(1, Number(piece.priceGP) || 1), denomination: "gp" },
      rarity: "",
      identified: true,
      type: { value: armorType },
      armor: {
        value: Number(piece.ac) || (lightArmor ? 11 : 0),
        type: armorType
      },
      equipped: false
    },
    flags: {
      [MODULE_ID]: {
        catalogApparel: true,
        catalogId: piece.catalogId,
        apparelId: piece.id,
        topic: piece.topic,
        passive
      }
    }
  };
}

function buildCustomBookStock(catalog, options = {}) {
  const multiplier = Math.max(0.1, Number(options.priceMultiplier) || 1);
  const formatPrice = options.formatPrice ?? ((cp) => `${cp} cp`);

  return (catalog.books ?? []).map((book) => {
    const uuid = townforgeBookUuid(book.id);
    const priceCP = Math.max(1, Math.round((Number(book.priceGP) || 1) * 100 * multiplier));
    return {
      id: `tfstock-catalog-${stableHash(uuid)}`,
      uuid,
      name: book.name,
      img: book.img,
      type: "loot",
      priceCP,
      priceLabel: formatPrice(priceCP),
      source: "catalog",
      pack: catalog.id,
      filter: book.topic,
      topic: book.topic,
      unlimited: true
    };
  });
}

function buildCustomFoodStock(catalog, options = {}) {
  const multiplier = Math.max(0.1, Number(options.priceMultiplier) || 1);
  const formatPrice = options.formatPrice ?? ((cp) => `${cp} cp`);

  return (catalog.foods ?? []).map((food) => {
    const uuid = townforgeFoodUuid(food.id);
    const priceCP = Math.max(1, Math.round((Number(food.priceGP) || 1) * 100 * multiplier));
    return {
      id: `tfstock-catalog-${stableHash(uuid)}`,
      uuid,
      name: food.name,
      img: food.img,
      type: "consumable",
      priceCP,
      priceLabel: formatPrice(priceCP),
      source: "catalog",
      pack: catalog.id,
      filter: food.topic,
      topic: food.topic,
      unlimited: true
    };
  });
}

function buildCustomApparelStock(catalog, options = {}) {
  const multiplier = Math.max(0.1, Number(options.priceMultiplier) || 1);
  const formatPrice = options.formatPrice ?? ((cp) => `${cp} cp`);

  return (catalog.apparel ?? []).map((piece) => {
    const uuid = townforgeApparelUuid(piece.id);
    const priceCP = Math.max(1, Math.round((Number(piece.priceGP) || 1) * 100 * multiplier));
    return {
      id: `tfstock-catalog-${stableHash(uuid)}`,
      uuid,
      name: piece.name,
      img: piece.img,
      type: "equipment",
      priceCP,
      priceLabel: formatPrice(priceCP),
      source: "catalog",
      pack: catalog.id,
      filter: piece.topic,
      topic: piece.topic,
      unlimited: true
    };
  });
}

/**
 * @param {object} catalog
 * @param {{priceMultiplier?: number, formatPrice?: (cp:number)=>string}} options
 * @returns {object[]}
 */
export function buildCatalogStock(catalog, options = {}) {
  if (isFoodCatalog(catalog)) return buildCustomFoodStock(catalog, options);
  if (isApparelCatalog(catalog)) return buildCustomApparelStock(catalog, options);
  return buildCustomBookStock(catalog, options);
}

async function resolveNamedCompendiumStock(lookups, options, { validateName, defaultTopic, validateDoc }) {
  const formatPrice = options.formatPrice ?? ((cp) => `${cp} cp`);
  const entries = [];
  const seen = new Set();

  for (const lookup of lookups) {
    const name = String(lookup?.name ?? "").trim();
    if (!name) continue;

    const doc = await findCompendiumItemByName(name);
    if (!doc) {
      console.warn(`[TownForge] Catalog compendium item not found: ${name}`);
      continue;
    }

    const resolvedName = String(doc.name ?? name).trim();
    const identity = resolvedName.toLowerCase();
    if (seen.has(identity)) continue;
    if (validateDoc && !validateDoc(doc)) continue;
    if (!validateName(resolvedName)) continue;
    seen.add(identity);

    const armorType = rowArmorType(doc.system ?? doc);
    const topic = lookup.topic ?? defaultTopic(resolvedName, armorType);

    const uuid = doc.uuid ?? `Compendium.${doc.pack?.collection ?? "unknown"}.${doc.id}`;
    const priceCP = Math.max(
      1,
      Math.round(
        typeof options.priceFromItem === "function" ? options.priceFromItem(doc) : 25 * 100
      )
    );
    entries.push({
      id: `tfstock-compendium-${stableHash(uuid)}`,
      uuid,
      name: resolvedName,
      img: doc.img || "icons/svg/item-bag.svg",
      type: doc.type || "loot",
      priceCP,
      priceLabel: formatPrice(priceCP),
      source: "compendium",
      pack: doc.pack?.collection ?? "",
      filter: topic,
      topic,
      unlimited: true
    });
  }

  return entries;
}

/**
 * Resolve dnd5e compendium book-related items for a catalog NPC.
 */
export async function buildCompendiumBookStock(catalog, options = {}) {
  const lookups = catalog.compendiumBooks?.length
    ? catalog.compendiumBooks
    : DEFAULT_COMPENDIUM_BOOK_ITEMS;
  return resolveNamedCompendiumStock(lookups, options, {
    validateName: isBookRelatedName,
    defaultTopic: () => "gear"
  });
}

/**
 * Discover food-related compendium items across installed item packs.
 * @returns {Promise<{name:string, topic:string}[]>}
 */
export async function discoverCompendiumFoodLookups() {
  const seen = new Set();
  const lookups = [];

  const add = (name, topic) => {
    const key = String(name).trim().toLowerCase();
    if (!key || seen.has(key) || !isFoodRelatedName(name)) return;
    seen.add(key);
    lookups.push({ name: String(name).trim(), topic: topic ?? inferFoodTopic(name) });
  };

  for (const lookup of DEFAULT_COMPENDIUM_FOOD_ITEMS) add(lookup.name, lookup.topic);

  for (const pack of listCandidatePacks("Item")) {
    const index = pack.index?.length ? pack.index : await pack.getIndex?.().catch(() => []);
    for (const row of index) {
      if (!row?.name) continue;
      add(row.name, inferFoodTopic(row.name));
    }
  }

  return lookups;
}

/**
 * Resolve dnd5e compendium food-related items for a grocer catalog.
 */
export async function buildCompendiumFoodStock(catalog, options = {}) {
  const lookups = catalog.compendiumFoods?.length
    ? catalog.compendiumFoods
    : await discoverCompendiumFoodLookups();
  return resolveNamedCompendiumStock(lookups, options, {
    validateName: isFoodRelatedName,
    defaultTopic: (name) => inferFoodTopic(name)
  });
}

/**
 * Discover clothing and light armor from installed item packs.
 * @returns {Promise<{name:string, topic:string}[]>}
 */
export async function discoverCompendiumApparelLookups() {
  const seen = new Set();
  const lookups = [];

  const add = (name, topic) => {
    const key = String(name).trim().toLowerCase();
    if (!key || seen.has(key)) return;
    if (!isApparelRelatedName(name) && topic !== "light-armor") return;
    seen.add(key);
    lookups.push({ name: String(name).trim(), topic });
  };

  for (const pack of listCandidatePacks("Item")) {
    const index = pack.index?.length ? pack.index : await pack.getIndex?.().catch(() => []);
    for (const row of index) {
      if (!isApparelIndexRow(row)) continue;
      const armorType = rowArmorType(row);
      add(row.name, inferApparelTopic(row.name, armorType));
    }
  }

  return lookups;
}

/**
 * Resolve dnd5e compendium apparel for a tailor catalog.
 */
export async function buildCompendiumApparelStock(catalog, options = {}) {
  const lookups = catalog.compendiumApparel?.length
    ? catalog.compendiumApparel
    : await discoverCompendiumApparelLookups();

  return resolveNamedCompendiumStock(lookups, options, {
    validateName: isApparelRelatedName,
    defaultTopic: inferApparelTopic,
    validateDoc: (doc) => {
      const armorType = rowArmorType(doc.system ?? doc);
      if (armorType === "medium" || armorType === "heavy" || armorType === "shield") return false;
      if (armorType === "light" || armorType === "clothing") return true;
      return isApparelRelatedName(doc.name);
    }
  });
}

/**
 * Merge custom catalog stock with compendium stock, deduped by name.
 */
export async function buildFullCatalogStock(catalog, options = {}) {
  const custom = buildCatalogStock(catalog, options);
  let compendium = [];
  if (isFoodCatalog(catalog)) compendium = await buildCompendiumFoodStock(catalog, options);
  else if (isApparelCatalog(catalog)) compendium = await buildCompendiumApparelStock(catalog, options);
  else compendium = await buildCompendiumBookStock(catalog, options);

  const validator = getCatalogEntryValidator(catalog);
  const seen = new Set();
  const merged = [];

  for (const entry of [...custom, ...compendium]) {
    const key = String(entry.name ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    if (!validator(entry)) continue;
    seen.add(key);
    merged.push(entry);
  }

  return merged;
}

/**
 * @param {object[]} inventory
 * @param {object} [catalog]
 * @returns {boolean}
 */
export function inventoryViolatesCatalogOnly(inventory, catalog) {
  const catalogOnly = Boolean(catalog?.catalogOnly);
  if (!catalogOnly) return false;
  const validator = getCatalogEntryValidator(catalog);
  return (inventory ?? []).some((entry) => entry && !validator(entry));
}

/** @deprecated Use inventoryViolatesCatalogOnly */
export function inventoryHasNonBookEntries(inventory, catalog) {
  return inventoryViolatesCatalogOnly(inventory, catalog);
}
