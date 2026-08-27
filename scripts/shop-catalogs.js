import { FLAGS, MODULE_ID } from "./constants.js";
import { stableHash } from "./shop-random.js";

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
