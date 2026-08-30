const BOOK_UUID_PREFIX = "townforge-book:";

const BOOK_NAME_RE =
  /\b(spell\s*books?|spellbook|books?|tome|journal|diary|codex|grimoire|lexicon|folio|primer|treatise|chapbook|ledger|parchment|paper|spell\s*scroll|scroll\s*case|maps?|ink(?:\s*\(|\s*pen|\s*bottle)?|quill|hymnal|bestiary|chronicle|compendium|almanac|atlas|catalogue|catalog)\b/i;

const NOT_BOOK_RE =
  /\b(torch|tinderbox|tinder|clothes|clothing|armor|armou?r|weapon|trident|thrower|dagger|swords?|axes?|hammers?|spears?|bows?|crossbows?|packs?|potions?|rations?|ropes?|shields?|maces?|staffs?|staves)\b/i;

/**
 * Whether a shop stock row or compendium item name is book-related.
 * @param {object|string} entryOrName
 * @returns {boolean}
 */
export function isBookRelatedShopEntry(entryOrName) {
  if (!entryOrName) return false;
  if (typeof entryOrName === "object") {
    if (String(entryOrName.uuid ?? "").startsWith(BOOK_UUID_PREFIX)) return true;
    if (entryOrName.source === "catalog" || entryOrName.source === "compendium") {
      return isBookRelatedName(entryOrName.name);
    }
    return isBookRelatedName(entryOrName.name);
  }
  return isBookRelatedName(entryOrName);
}

/**
 * @param {unknown} name
 * @returns {boolean}
 */
export function isBookRelatedName(name) {
  const text = String(name ?? "").trim();
  if (!text) return false;
  if (NOT_BOOK_RE.test(text) && !/\bspell\s*books?\b/i.test(text)) return false;
  return BOOK_NAME_RE.test(text);
}

/** Default dnd5e compendium titles stocked at bookstores when not overridden. */
export const DEFAULT_COMPENDIUM_BOOK_ITEMS = Object.freeze([
  { name: "Spellbook", topic: "magic" },
  { name: "Book", topic: "gear" },
  { name: "Map", topic: "adventure" },
  { name: "Parchment (one sheet)", topic: "gear" },
  { name: "Paper (one sheet)", topic: "gear" },
  { name: "Ink (1 ounce bottle)", topic: "gear" },
  { name: "Ink Pen", topic: "gear" },
  { name: "Spell Scroll (Cantrip)", topic: "magic" },
  { name: "Spell Scroll (Level 1)", topic: "magic" },
  { name: "Case, Map or Scroll", topic: "gear" }
]);

/**
 * @param {unknown} name
 * @returns {"magic"|"adventure"|"religion"|"gear"}
 */
export function inferBookTopic(name) {
  const text = String(name ?? "").toLowerCase();
  if (/\bspell\b|scroll\b|grimoire|codex|cantrip/i.test(text)) return "magic";
  if (/\bmap\b|atlas|almanac|adventure/i.test(text)) return "adventure";
  if (/\bhymn|chronicle|bestiary|treatise|sacred|pilgrim|saint|religion|prayer/i.test(text)) {
    return "religion";
  }
  return "gear";
}

/**
 * @param {object} row
 * @returns {boolean}
 */
export function isBookIndexRow(row) {
  if (!row?.name) return false;
  const type = String(row.type ?? "").toLowerCase();
  if (type && !["loot", "equipment", "consumable"].includes(type)) return false;
  return isBookRelatedName(row.name);
}
