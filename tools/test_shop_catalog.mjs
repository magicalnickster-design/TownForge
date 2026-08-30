/**
 * TownForge custom shop catalog tests.
 * Run: node tools/test_shop_catalog.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildCatalogStock,
  discoverCompendiumBookLookups,
  inventoryViolatesCatalogOnly
} from "../scripts/shop-catalogs.js";
import {
  DEFAULT_COMPENDIUM_BOOK_ITEMS,
  isBookRelatedName,
  isBookRelatedShopEntry
} from "../scripts/shop-books.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(__dirname, "../data/shop-catalogs/vela-inkwell.json"), "utf8")
);

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log("TownForge shop catalog tests");

test("vela catalog has no custom books", () => {
  assert(!catalog.books || catalog.books.length === 0, "expected no custom books");
  assert(catalog.catalogOnly === true, "catalogOnly flag");
  assert(catalog.shopType === "bookstore", "bookstore shop type");
});

test("custom book stock is empty for vela", () => {
  const stock = buildCatalogStock(catalog, {
    priceMultiplier: 1,
    formatPrice: (cp) => `${cp} cp`
  });
  assert(stock.length === 0, "no custom stock rows");
});

const lookups = await discoverCompendiumBookLookups();
test("compendium book discovery includes dnd defaults", () => {
  assert(lookups.length >= DEFAULT_COMPENDIUM_BOOK_ITEMS.length, "default compendium books");
  for (const item of DEFAULT_COMPENDIUM_BOOK_ITEMS) {
    assert(
      lookups.some((lookup) => lookup.name.toLowerCase() === item.name.toLowerCase()),
      `missing ${item.name}`
    );
  }
});

test("bookshop filters reject general store junk", () => {
  assert(isBookRelatedName("Spellbook"), "spellbook");
  assert(isBookRelatedName("Book"), "book");
  assert(!isBookRelatedName("Dwarven Thrower"), "magic weapon");
  assert(!isBookRelatedName("Trident"), "weapon");
  assert(!isBookRelatedName("Torch"), "torch");
  assert(!isBookRelatedName("Tinderbox"), "tinderbox");
  assert(!isBookRelatedName("Fine Clothes"), "clothes");
  assert(
    inventoryViolatesCatalogOnly(
      [
        { name: "Torch", uuid: "Compendium.dnd5e.items.torch", source: "automatic" },
        { name: "Spellbook", uuid: "Compendium.dnd5e.items.spellbook", source: "compendium" }
      ],
      catalog
    ),
    "detects mixed inventory"
  );
  assert(
    !inventoryViolatesCatalogOnly(
      [{ name: "Spellbook", uuid: "Compendium.dnd5e.items.spellbook", source: "compendium" }],
      catalog
    ),
    "compendium-only inventory passes"
  );
  assert(
    isBookRelatedShopEntry({ name: "Spellbook", uuid: "Compendium.dnd5e.items.spellbook", source: "compendium" }),
    "compendium book entry"
  );
});

console.log(`\n${passed} tests passed`);
