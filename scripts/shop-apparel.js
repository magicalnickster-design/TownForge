const APPAREL_UUID_PREFIX = "townforge-apparel:";

const CLOTHING_NAME_RE =
  /\b(clothes|clothing|costume|robe|outfit|garment|tunic|doublet|blouse|dress|gown|cloak|cape|shawl|scarf|veil|hood|hat|cap|bonnet|veil|gloves|mittens|socks|stockings|boots|shoes|sandals|slippers|belt|sash|jerkin|vest|doublet|breeches|trousers|pants|skirt|kirtle|chemise|smock|apron|mask|pin|brooch|earrings?|necklace|bracelet|ring|hairpin|circlet|tiara|garters?|collar|corset|bodice|mantle|surcoat|tabard|linen|wool|silk|leather armor|studded leather|padded armor|padded|leather)\b/i;

const NOT_APPAREL_RE =
  /\b(weapon|sword|dagger|axe|hammer|spear|bow|crossbow|shield|potion|scroll|tool|kit|pack|ration|torch|oil\b|acid|poison|medium armor|heavy armor|chain mail|plate|breastplate|splint|half plate|ring mail|scale mail|chain shirt)\b/i;

const MEDIUM_HEAVY_ARMOR_RE =
  /\b(chain shirt|chain mail|scale mail|breastplate|half plate|splint|plate|ring mail|hide armor)\b/i;

/**
 * @param {unknown} name
 * @returns {boolean}
 */
export function isApparelRelatedName(name) {
  const text = String(name ?? "").trim();
  if (!text) return false;
  if (NOT_APPAREL_RE.test(text)) return false;
  if (MEDIUM_HEAVY_ARMOR_RE.test(text)) return false;
  return CLOTHING_NAME_RE.test(text);
}

/**
 * @param {object} row
 * @returns {string}
 */
export function rowArmorType(row) {
  return String(
    row?.system?.armor?.type ?? row?.armorType ?? row?.system?.type?.value ?? ""
  )
    .trim()
    .toLowerCase();
}

/**
 * @param {object} row
 * @returns {boolean}
 */
export function isApparelIndexRow(row) {
  if (!row?.name) return false;
  const type = String(row.type ?? "").toLowerCase();
  if (type && type !== "equipment") return false;
  const armorType = rowArmorType(row);
  if (armorType === "medium" || armorType === "heavy" || armorType === "shield") return false;
  if (armorType === "light" || armorType === "clothing") return true;
  return isApparelRelatedName(row.name);
}

/**
 * @param {object|string} entryOrName
 * @returns {boolean}
 */
export function isApparelRelatedShopEntry(entryOrName) {
  if (!entryOrName) return false;
  if (typeof entryOrName === "object") {
    if (String(entryOrName.uuid ?? "").startsWith(APPAREL_UUID_PREFIX)) return true;
    if (entryOrName.source === "catalog" || entryOrName.source === "compendium") {
      return isApparelRelatedName(entryOrName.name) || entryOrName.topic;
    }
    return isApparelRelatedName(entryOrName.name);
  }
  return isApparelRelatedName(entryOrName);
}

/**
 * @param {string} name
 * @param {string} [armorType]
 * @returns {string}
 */
export function inferApparelTopic(name, armorType = "") {
  const text = String(name ?? "").toLowerCase();
  const armor = String(armorType ?? "").toLowerCase();
  if (armor === "light" || /\b(leather|studded|padded)\b/.test(text)) return "light-armor";
  if (/earring|necklace|bracelet|brooch|pin|circlet|tiara|ring\b|jewel/.test(text)) return "jewelry";
  if (/boot|shoe|sandal|slipper|sock|stocking/.test(text)) return "footwear";
  if (/glove|mitten/.test(text)) return "gloves";
  if (/cloak|cape|shawl|mantle|hood/.test(text)) return "outerwear";
  if (/mask|veil/.test(text)) return "accessories";
  if (/fine|court|gown|dress|formal/.test(text)) return "formal";
  if (/apron|work|linen/.test(text)) return "workwear";
  if (/clothes|robe|costume|outfit|tunic/.test(text)) return "clothing";
  return "accessories";
}

export { APPAREL_UUID_PREFIX };
