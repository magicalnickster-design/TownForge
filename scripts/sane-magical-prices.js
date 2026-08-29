import { MODULE_ID, SANE_MAGICAL_PRICES_SETTING } from "./constants.js";

/** @type {Map<string, number>|null} */
let priceIndex = null;

/** @type {Promise<Map<string, number>>|null} */
let loadPromise = null;

/**
 * @param {string} name
 */
function normalizeName(name) {
  return String(name ?? "")
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * @param {Record<string, number>} items
 */
function buildIndex(items) {
  const index = new Map();
  for (const [name, priceGP] of Object.entries(items ?? {})) {
    const key = normalizeName(name);
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
 * Load SMP table from module data (cached).
 * @returns {Promise<Map<string, number>>}
 */
export function readySaneMagicalPrices() {
  if (priceIndex) return Promise.resolve(priceIndex);
  loadPromise ??= fetch(`modules/${MODULE_ID}/data/sane-magical-prices.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      priceIndex = buildIndex(data?.items ?? {});
      return priceIndex;
    })
    .catch((error) => {
      console.error("[TownForge] Failed to load Sane Magical Prices data", error);
      priceIndex = new Map();
      return priceIndex;
    });
  return loadPromise;
}

/**
 * @param {Map<string, number>} index
 * @param {string} key
 */
function lookupKey(index, key) {
  if (index.has(key)) return index.get(key);
  const compact = key.replace(/[’']/g, "'");
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
 * Resolve Saidoro's Sane Magical Price in GP for an item, or null if unknown.
 * @param {string} name
 * @param {object|null} [item]
 * @returns {number|null}
 */
export function lookupSaneMagicalPriceGP(name, item = null) {
  if (!priceIndex?.size) return null;
  const normalized = normalizeName(name);
  if (!normalized) return null;

  let price = lookupKey(priceIndex, normalized);
  if (price != null) return price;

  const scrollMatch = normalized.match(/spell scroll \((cantrip|level (\d+))\)/);
  if (scrollMatch) {
    const level = scrollMatch[1] === "cantrip" ? 0 : Number(scrollMatch[2]);
    price = lookupKey(priceIndex, `spell scroll level ${level}`);
    if (price != null) return price;
  }

  const scrollLevel = normalized.match(/^spell scroll level (\d+)$/);
  if (scrollLevel) {
    price = lookupKey(priceIndex, `spell scroll level ${scrollLevel[1]}`);
    if (price != null) return price;
  }

  const beadMatch = normalized.match(/necklace of fireballs.*?\((\w+)\s+beads?\)/);
  if (beadMatch) {
    const word = beadMatch[1].toLowerCase();
    const count = BEAD_WORDS[word] ?? null;
    if (count) {
      const words = ["zero", "one", "two", "three", "four", "five", "six"];
      price = lookupKey(priceIndex, `necklace of fireballs (${words[count]} bead${count === 1 ? "" : "s"})`);
      if (price != null) return price;
    }
  }

  const prayerMatch = normalized.match(/prayer bead\s*[-–]\s*(.+)$/);
  if (prayerMatch) {
    price = lookupKey(priceIndex, `prayer bead - ${prayerMatch[1].trim()}`);
    if (price != null) return price;
  }

  const featherMatch = normalized.match(/quaal's feather token (.+)$/);
  if (featherMatch) {
    price = lookupKey(priceIndex, `quaal's feather token ${featherMatch[1].trim()}`);
    if (price != null) return price;
  }

  const ivoryMatch = normalized.match(/ivory goat\s*\(?\s*(travail|traveling|terror)\s*\)?/);
  if (ivoryMatch) {
    price = lookupKey(priceIndex, `ivory goat (${ivoryMatch[1]})`);
    if (price != null) return price;
  }

  const instrumentMatch = normalized.match(/instrument of the bards\s*[-–]\s*(.+)$/);
  if (instrumentMatch) {
    price = lookupKey(priceIndex, `instrument of the bards - ${instrumentMatch[1].trim()}`);
    if (price != null) return price;
  }

  const plusMatch = normalized.match(/^\+(\d)\s+(.+)$/);
  if (plusMatch) {
    const bonus = plusMatch[1];
    const rest = plusMatch[2];
    if (/\barmor\b/.test(rest) || item?.system?.armor?.type) {
      price = lookupKey(priceIndex, `+${bonus} armor`);
      if (price != null) return price;
    }
    if (/\bshield\b/.test(rest) || rest === "shield") {
      price = lookupKey(priceIndex, `+${bonus} shield`);
      if (price != null) return price;
    }
    if (
      item?.type === "weapon" ||
      item?.system?.weaponType ||
      /\b(sword|dagger|axe|bow|crossbow|mace|hammer|spear|trident|whip|javelin|lance|maul|glaive|halberd|rapier|scimitar|sickle|club|staff|warhammer|war pick|morningstar|flail|battleaxe|handaxe|light hammer|mace|quarterstaff|sling|blowgun|net|pike)\b/.test(
        rest
      )
    ) {
      price = lookupKey(priceIndex, `+${bonus} weapon`);
      if (price != null) return price;
    }
  }

  const warMage = normalized.match(/wand of the war mage \+(\d)/);
  if (warMage) {
    price = lookupKey(priceIndex, `wand of the war mage +${warMage[1]}`);
    if (price != null) return price;
  }

  const pactKeeper = normalized.match(/rod of the pact keeper \+(\d)/);
  if (pactKeeper) {
    price = lookupKey(priceIndex, `rod of the pact keeper +${pactKeeper[1]}`);
    if (price != null) return price;
  }

  const ammo = normalized.match(/ammunition \+(\d)/);
  if (ammo) {
    price = lookupKey(priceIndex, `ammunition +${ammo[1]} (each)`);
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
