import { LOG_PREFIX, MODULE_ID, SANE_MAGICAL_PRICES_SETTING } from "./constants.js";

const DATA_URL = `modules/${MODULE_ID}/data/sane-magical-prices.json`;

/** @type {Map<string, number>|null} */
let priceIndex = null;

/** @type {Promise<Map<string, number>>|null} */
let loadPromise = null;

/**
 * @param {string} name
 */
export function normalizeSaneMagicalItemName(name) {
  return String(name ?? "")
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * @param {Record<string, number>} items
 */
export function buildSaneMagicalPriceIndex(items) {
  const index = new Map();
  for (const [name, priceGP] of Object.entries(items ?? {})) {
    const key = normalizeSaneMagicalItemName(name);
    const value = Number(priceGP);
    if (!key || !Number.isFinite(value) || value < 0) continue;
    index.set(key, value);
  }
  return index;
}

export function isSaneMagicalPricesEnabled() {
  try {
    return Boolean(game?.settings?.get(MODULE_ID, SANE_MAGICAL_PRICES_SETTING));
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<unknown>}
 */
async function fetchSaneMagicalPricesJson() {
  if (globalThis.foundry?.utils?.fetchJsonWithTimeout) {
    return foundry.utils.fetchJsonWithTimeout(DATA_URL);
  }
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * Load SMP table from module data (cached).
 * @returns {Promise<Map<string, number>>}
 */
export function readySaneMagicalPrices() {
  if (priceIndex?.size) return Promise.resolve(priceIndex);
  loadPromise ??= fetchSaneMagicalPricesJson()
    .then((data) => {
      priceIndex = buildSaneMagicalPriceIndex(data?.items ?? {});
      if (!priceIndex.size) {
        console.warn(`${LOG_PREFIX} Sane Magical Prices data loaded but contained no entries`);
      } else {
        console.log(`${LOG_PREFIX} Loaded ${priceIndex.size} Sane Magical Prices entries`);
      }
      return priceIndex;
    })
    .catch((error) => {
      console.error(`${LOG_PREFIX} Failed to load Sane Magical Prices data`, error);
      priceIndex = null;
      loadPromise = null;
      return new Map();
    });
  return loadPromise;
}

/**
 * @param {Map<string, number>} index
 * @param {string} key
 */
function lookupKey(index, key) {
  if (index.has(key)) return index.get(key);
  const compact = key.replace(/['’]/g, "'");
  if (index.has(compact)) return index.get(compact);
  return null;
}

const BEAD_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6
};

/**
 * Infer spell scroll level from item name and/or compendium data.
 * @param {string} name
 * @param {object|null} [item]
 * @returns {number|null}
 */
export function inferSpellScrollLevel(name, item = null) {
  const normalized = normalizeSaneMagicalItemName(name);
  if (!/^spell scroll\b/.test(normalized)) return null;

  const parenMatch = normalized.match(
    /spell scroll \((cantrip|(\d+)(?:st|nd|rd|th)?\s*level|level (\d+))\)/i
  );
  if (parenMatch) {
    if (parenMatch[1] === "cantrip") return 0;
    const level = Number(parenMatch[2] ?? parenMatch[3]);
    if (Number.isFinite(level)) return level;
  }

  const levelOnly = normalized.match(/^spell scroll level (\d+)$/);
  if (levelOnly) return Number(levelOnly[1]);

  const levelFromItem = Number(item?.spellLevel ?? item?.system?.level);
  if (Number.isFinite(levelFromItem)) return levelFromItem;

  return null;
}

/**
 * Build a minimal item stub for sane price lookup from a shop stock row.
 * @param {object|null|undefined} stock
 * @returns {object|null}
 */
export function sanePriceContextFromStock(stock) {
  if (!stock || typeof stock !== "object") return null;
  const spellLevel = inferSpellScrollLevel(stock.name, stock);
  return {
    type: stock.type,
    spellLevel: spellLevel ?? undefined,
    system: {
      level: spellLevel ?? undefined,
      rarity: stock.rarity,
      armor: stock.armorType ? { type: stock.armorType } : undefined,
      weaponType: stock.weaponType
    }
  };
}

/**
 * Resolve Saidoro's Sane Magical Price in GP for an item, or null if unknown.
 * @param {string} name
 * @param {object|null} [item]
 * @param {Map<string, number>|null} [index]
 * @returns {number|null}
 */
export function lookupSaneMagicalPriceGP(name, item = null, index = priceIndex) {
  if (!index?.size) return null;
  const normalized = normalizeSaneMagicalItemName(name);
  if (!normalized) return null;

  let price = lookupKey(index, normalized);
  if (price != null) return price;

  const scrollLevel = inferSpellScrollLevel(name, item);
  if (scrollLevel != null) {
    price = lookupKey(index, `spell scroll level ${scrollLevel}`);
    if (price != null) return price;
  }

  const beadMatch = normalized.match(/necklace of fireballs.*?\((\w+)\s+beads?\)/);
  if (beadMatch) {
    const word = beadMatch[1].toLowerCase();
    const count = BEAD_WORDS[word] ?? null;
    if (count) {
      const words = ["zero", "one", "two", "three", "four", "five", "six"];
      price = lookupKey(index, `necklace of fireballs (${words[count]} bead${count === 1 ? "" : "s"})`);
      if (price != null) return price;
    }
  }

  const prayerMatch = normalized.match(/prayer bead\s*[-–]\s*(.+)$/);
  if (prayerMatch) {
    price = lookupKey(index, `prayer bead - ${prayerMatch[1].trim()}`);
    if (price != null) return price;
  }

  const featherMatch = normalized.match(/quaal's feather token (.+)$/);
  if (featherMatch) {
    price = lookupKey(index, `quaal's feather token ${featherMatch[1].trim()}`);
    if (price != null) return price;
  }

  const ivoryMatch = normalized.match(/ivory goat\s*\(?\s*(travail|traveling|terror)\s*\)?/);
  if (ivoryMatch) {
    price = lookupKey(index, `ivory goat (${ivoryMatch[1]})`);
    if (price != null) return price;
  }

  const instrumentMatch = normalized.match(/instrument of the bards\s*[-–]\s*(.+)$/);
  if (instrumentMatch) {
    price = lookupKey(index, `instrument of the bards - ${instrumentMatch[1].trim()}`);
    if (price != null) return price;
  }

  const plusMatch = normalized.match(/^\+(\d)\s+(.+)$/);
  if (plusMatch) {
    const bonus = plusMatch[1];
    const rest = plusMatch[2];
    if (/\barmor\b/.test(rest) || item?.system?.armor?.type) {
      price = lookupKey(index, `+${bonus} armor`);
      if (price != null) return price;
    }
    if (/\bshield\b/.test(rest) || rest === "shield") {
      price = lookupKey(index, `+${bonus} shield`);
      if (price != null) return price;
    }
    if (
      item?.type === "weapon" ||
      item?.system?.weaponType ||
      /\b(longsword|shortsword|greatsword|sword|dagger|axe|bow|crossbow|mace|hammer|spear|trident|whip|javelin|lance|maul|glaive|halberd|rapier|scimitar|sickle|club|staff|warhammer|war pick|morningstar|flail|battleaxe|handaxe|light hammer|mace|quarterstaff|sling|blowgun|net|pike)\b/.test(
        rest
      )
    ) {
      price = lookupKey(index, `+${bonus} weapon`);
      if (price != null) return price;
    }
  }

  const warMage = normalized.match(/wand of the war mage \+(\d)/);
  if (warMage) {
    price = lookupKey(index, `wand of the war mage +${warMage[1]}`);
    if (price != null) return price;
  }

  const pactKeeper = normalized.match(/rod of the pact keeper \+(\d)/);
  if (pactKeeper) {
    price = lookupKey(index, `rod of the pact keeper +${pactKeeper[1]}`);
    if (price != null) return price;
  }

  const ammo = normalized.match(/ammunition \+(\d)/);
  if (ammo) {
    price = lookupKey(index, `ammunition +${ammo[1]} (each)`);
    if (price != null) return price;
  }

  return null;
}

/**
 * @param {string} name
 * @param {object|null} [item]
 * @returns {number|null} price in copper
 */
export function lookupSaneMagicalPriceCP(name, item = null) {
  const gp = lookupSaneMagicalPriceGP(name, item);
  if (gp == null) return null;
  return Math.max(1, Math.round(gp * 100));
}

export function clearSaneMagicalPricesCache() {
  priceIndex = null;
  loadPromise = null;
}
