const FOOD_UUID_PREFIX = "townforge-food:";

const FOOD_NAME_RE =
  /\b(rations?|food|breads?|flatbread|loaf|cheese|meat|jerky|sausage|wine|ale|beer|mead|cider|fruit|berries?|vegetables?|grain|flour|barley|wheat|oat|rye|corn|honey|spice|salt|butter|eggs?|fish|soup|stew|porridge|milk|waterskin|water\b|syrup|vinegar|nut|mushroom|herb(?!al)|pickle|kraut|scone|biscuit|cake|pie|pastry|roast|smoked|dried|preserves?|jam|gruel|feast|meal|snack|provisions?|groceries|apricot|herring|cabbage|millet|stew)\b/i;

const NOT_FOOD_RE =
  /\b(potion|elixir|poison|antitoxin|acid|alchemy|scroll|component|torch|oil\b|weapon|armor|tool|kit|focus|symbol|ammunition|feed\b|horse|animal)\b/i;

/**
 * @param {unknown} name
 * @returns {boolean}
 */
export function isFoodRelatedName(name) {
  const text = String(name ?? "").trim();
  if (!text) return false;
  if (NOT_FOOD_RE.test(text)) return false;
  return FOOD_NAME_RE.test(text);
}

/**
 * @param {object|string} entryOrName
 * @returns {boolean}
 */
export function isFoodRelatedShopEntry(entryOrName) {
  if (!entryOrName) return false;
  if (typeof entryOrName === "object") {
    if (String(entryOrName.uuid ?? "").startsWith(FOOD_UUID_PREFIX)) return true;
    if (entryOrName.source === "catalog" || entryOrName.source === "compendium") {
      return isFoodRelatedName(entryOrName.name);
    }
    return isFoodRelatedName(entryOrName.name);
  }
  return isFoodRelatedName(entryOrName);
}

/** High-priority compendium staples for grocers when present. */
export const DEFAULT_COMPENDIUM_FOOD_ITEMS = Object.freeze([
  { name: "Rations (1 day)", topic: "travel" },
  { name: "Rations", topic: "travel" },
  { name: "Waterskin", topic: "drink" },
  { name: "Bread", topic: "baked" },
  { name: "Cheese", topic: "preserved" },
  { name: "Dried Meat", topic: "preserved" },
  { name: "Wine (common)", topic: "drink" },
  { name: "Wine", topic: "drink" },
  { name: "Ale", topic: "drink" },
  { name: "Fruit", topic: "produce" },
  { name: "Vegetables", topic: "produce" },
  { name: "Honey", topic: "preserved" },
  { name: "Spice", topic: "grain" },
  { name: "Salt", topic: "grain" },
  { name: "Flour", topic: "grain" },
  { name: "Iron Rations", topic: "travel" }
]);

/**
 * @param {string} name
 * @returns {string}
 */
export function inferFoodTopic(name) {
  const text = String(name ?? "").toLowerCase();
  if (/wine|ale|beer|mead|cider|waterskin|water|milk/.test(text)) return "drink";
  if (/grain|flour|barley|wheat|oat|rye|corn|salt|spice/.test(text)) return "grain";
  if (/fruit|vegetable|berry|herb|mushroom/.test(text)) return "produce";
  if (/ration|jerky|dried|pickle|cheese|honey|smoked|preserve/.test(text)) return "preserved";
  if (/bread|cake|pie|biscuit|scone|pastry|loaf/.test(text)) return "baked";
  if (/stew|soup|porridge|roast|meal|feast/.test(text)) return "hearty";
  return "provisions";
}

export { FOOD_UUID_PREFIX };
