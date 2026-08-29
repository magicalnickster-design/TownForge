const SHADY_UUID_PREFIX = "townforge-shady:";

const SHADY_NAME_RE =
  /\b(manacles?|thieves.? tools?|lockpick|crowbar|grappling hook|hooded lantern|lantern|ball bearings?|caltrops?|lock\b|poisoner|disguise kit|forgery kit|burglar|burglary|rogue|shady|smuggle|blackmail|bribe|bribery|forgery|forged|counterfeit|hood|cloak|dark|silent|quiet|vial|acid|poison|antitoxin|mirror|chalk|rope|silk rope|piton|hammer|oil\b|hunting trap|trap\b|manacle|shackles?|restraint|pouch|mask|dagger|shortsword|leather armor|studded leather|component pouch|tinderbox|thieves|pick|wire|garrote|knuckle|dice|loaded|weighted|seal|wax|parchment|scroll case|spyglass|bell|whistle|signal)\b/i;

const NOT_SHADY_RE =
  /\b(potion of healing|holy|divine|paladin|cleric|temple|plate|chain mail|breastplate|greatsword|longbow|heavy crossbow|feed\b|horse|saddle|ration|food|bread|wine|ale|spellbook|holy symbol)\b/i;

/**
 * @param {unknown} name
 * @returns {boolean}
 */
export function isShadyRelatedName(name) {
  const text = String(name ?? "").trim();
  if (!text) return false;
  if (NOT_SHADY_RE.test(text)) return false;
  return SHADY_NAME_RE.test(text);
}

/**
 * @param {object} row
 * @returns {boolean}
 */
export function isShadyIndexRow(row) {
  if (!row?.name) return false;
  const type = String(row.type ?? "").toLowerCase();
  if (type && !["equipment", "tool", "consumable", "weapon", "container", "loot"].includes(type)) {
    return false;
  }
  return isShadyRelatedName(row.name);
}

/**
 * @param {object|string} entryOrName
 * @returns {boolean}
 */
export function isShadyRelatedShopEntry(entryOrName) {
  if (!entryOrName) return false;
  if (typeof entryOrName === "object") {
    if (String(entryOrName.uuid ?? "").startsWith(SHADY_UUID_PREFIX)) return true;
    if (entryOrName.source === "catalog" || entryOrName.source === "compendium") {
      return isShadyRelatedName(entryOrName.name);
    }
    return isShadyRelatedName(entryOrName.name);
  }
  return isShadyRelatedName(entryOrName);
}

/**
 * @param {string} name
 * @returns {string}
 */
export function inferShadyTopic(name) {
  const text = String(name ?? "").toLowerCase();
  if (/manacle|shackle|restraint|chain\b/.test(text)) return "restraints";
  if (/thieves|lockpick|crowbar|burglar|grappling|piton/.test(text)) return "infiltration";
  if (/disguise|forgery|mask|hood|cloak/.test(text)) return "disguise";
  if (/poison|acid|vial/.test(text)) return "poison";
  if (/dagger|shortsword|leather|studded/.test(text)) return "gear";
  if (/chalk|mirror|bell|bearing|caltrop|trap|oil|lantern|rope|pouch|scroll|parchment|seal|wax/.test(text)) {
    return "tools";
  }
  return "tools";
}

/** Priority shady staples when scanning compendiums. */
export const DEFAULT_COMPENDIUM_SHADY_ITEMS = Object.freeze([
  { name: "Manacles", topic: "restraints" },
  { name: "Thieves' Tools", topic: "infiltration" },
  { name: "Thieves' tools", topic: "infiltration" },
  { name: "Crowbar", topic: "infiltration" },
  { name: "Grappling Hook", topic: "infiltration" },
  { name: "Hooded Lantern", topic: "tools" },
  { name: "Ball Bearings", topic: "tools" },
  { name: "Caltrops", topic: "tools" },
  { name: "Lock", topic: "infiltration" },
  { name: "Poisoner's Kit", topic: "poison" },
  { name: "Disguise Kit", topic: "disguise" },
  { name: "Forgery Kit", topic: "disguise" },
  { name: "Burglar's Pack", topic: "infiltration" },
  { name: "Rope, Silk (50 feet)", topic: "tools" },
  { name: "Rope", topic: "tools" },
  { name: "Oil", topic: "tools" },
  { name: "Acid", topic: "poison" },
  { name: "Poison, Basic", topic: "poison" },
  { name: "Hunting Trap", topic: "tools" },
  { name: "Mirror", topic: "tools" },
  { name: "Dagger", topic: "gear" },
  { name: "Leather Armor", topic: "gear" }
]);

export { SHADY_UUID_PREFIX };
