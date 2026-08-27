const ARMOR_TYPES = new Set(["light", "medium", "heavy"]);
const SHIELD_ARMOR_TYPE = "shield";

const ARMOR_NAME_RE =
  /\b(mail|plate|breastplate|chain\s*mail|chain\s*shirt|splint|scale\s*mail|half\s*plate|full\s*plate|helmet|gauntlet|greaves|cuirass|brigandine|padded|leather\s*armor|studded|ring\s*mail|barding)\b/i;

const CLOTHING_NAME_RE = /\b(clothes|clothing|costume|robe|outfit|garment|tunic|doublet)\b/i;

/**
 * Read dnd5e armor/equipment subtype from an index row or Foundry Item.
 * @param {object} item
 * @returns {string}
 */
export function itemArmorType(item) {
  return String(
    item?.armorType ?? item?.system?.armor?.type ?? item?.system?.type?.value ?? ""
  )
    .trim()
    .toLowerCase();
}

/**
 * Merchant UI filter bucket for a shop stock row or compendium item.
 * @param {object} item
 * @returns {string}
 */
export function resolveShopItemFilter(item) {
  const type = item?.type;
  const name = String(item?.name ?? "");
  const lowerName = name.toLowerCase();
  const armorType = itemArmorType(item);

  if (type === "weapon") return "weapons";

  if (type === "equipment") {
    if (armorType === SHIELD_ARMOR_TYPE || /\bshield\b/i.test(name)) return "shields";
    if (ARMOR_TYPES.has(armorType) || ARMOR_NAME_RE.test(name)) return "armor";
    if (armorType === "clothing" || CLOTHING_NAME_RE.test(name)) return "armor";
    return "gear";
  }

  if (type === "tool") return "tools";
  if (type === "container") return "containers";
  if (type === "consumable" && /potion|elixir|philter/i.test(name)) return "potions";
  if (/ingredient|component|herb|reagent/i.test(name)) return "ingredients";
  if (type === "consumable" || /ration|oil|torch|tinder|soap|feed/i.test(name)) return "supplies";
  return "gear";
}
