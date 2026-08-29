import { FLAGS, MODULE_ID } from "./constants.js";
import { findCompendiumItemByName } from "./compendium-resolver.js";
import { stableHash } from "./shop-random.js";
import {
  DEFAULT_COMPENDIUM_BOOK_ITEMS,
  isBookRelatedName,
  isBookRelatedShopEntry
} from "./shop-books.js";

const CATALOG_ROOT = `modules/${MODULE_ID}/data/shop-catalogs`;
const BOOK_UUID_PREFIX = "townforge-book:";

/** @type {Map<string, object>} */
const catalogByNpcId = new Map();

/** @type {Map<string, object>} */
const bookById = new Map();

/** @type {Promise<void>|null} */
let loadPromise = null;

export function townforgeBookUuid(bookId) {
  return `${BOOK_UUID_PREFIX}${bookId}`;
}

export function parseTownforgeBookUuid(uuid) {
  const text = String(uuid ?? "");
  if (!text.startsWith(BOOK_UUID_PREFIX)) return null;
  return text.slice(BOOK_UUID_PREFIX.length);
}

export function isTownforgeBookUuid(uuid) {
  return String(uuid ?? "").startsWith(BOOK_UUID_PREFIX);
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
 * @param {object} catalog
 * @param {{priceMultiplier?: number, formatPrice?: (cp:number)=>string}} options
 * @returns {object[]}
 */
export function buildCatalogStock(catalog, options = {}) {
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

/**
 * Resolve dnd5e compendium book-related items for a catalog NPC.
 * @param {object} catalog
 * @param {{priceMultiplier?: number, formatPrice?: (cp:number)=>string}} options
 * @returns {Promise<object[]>}
 */
export async function buildCompendiumBookStock(catalog, options = {}) {
  const multiplier = Math.max(0.1, Number(options.priceMultiplier) || 1);
  const formatPrice = options.formatPrice ?? ((cp) => `${cp} cp`);
  const lookups = catalog.compendiumBooks?.length
    ? catalog.compendiumBooks
    : DEFAULT_COMPENDIUM_BOOK_ITEMS;

  const entries = [];
  const seen = new Set();

  for (const lookup of lookups) {
    const name = String(lookup?.name ?? "").trim();
    if (!name) continue;

    const doc = await findCompendiumItemByName(name);
    if (!doc) {
      console.warn(`[TownForge] Bookshop compendium item not found: ${name}`);
      continue;
    }

    const resolvedName = String(doc.name ?? name).trim();
    const identity = resolvedName.toLowerCase();
    if (seen.has(identity)) continue;
    if (!isBookRelatedName(resolvedName)) continue;
    seen.add(identity);

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
      filter: lookup.topic ?? "gear",
      topic: lookup.topic ?? "gear",
      unlimited: true
    });
  }

  return entries;
}

/**
 * Merge custom catalog books with compendium book stock, deduped by name.
 * @param {object} catalog
 * @param {{priceMultiplier?: number, formatPrice?: (cp:number)=>string, priceFromItem?: (doc:object)=>number}} options
 * @returns {Promise<object[]>}
 */
export async function buildFullCatalogStock(catalog, options = {}) {
  const custom = buildCatalogStock(catalog, options);
  const compendium = await buildCompendiumBookStock(catalog, options);
  const seen = new Set();
  const merged = [];

  for (const entry of [...custom, ...compendium]) {
    const key = String(entry.name ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    if (!isBookRelatedShopEntry(entry)) continue;
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
export function inventoryHasNonBookEntries(inventory, catalog) {
  const catalogOnly = Boolean(catalog?.catalogOnly);
  if (!catalogOnly) return false;
  return (inventory ?? []).some((entry) => entry && !isBookRelatedShopEntry(entry));
}
