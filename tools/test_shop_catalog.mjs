/**
 * TownForge custom shop catalog tests.
 * Run: node tools/test_shop_catalog.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildBookItemData,
  buildCatalogStock,
  inventoryHasNonBookEntries,
  inventoryViolatesCatalogOnly,
  townforgeBookUuid
} from "../scripts/shop-catalogs.js";
import { isBookRelatedName, isBookRelatedShopEntry } from "../scripts/shop-books.js";

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

test("vela catalog has 50 unique books", () => {
  assert(catalog.books.length === 50, "expected 50 books");
  const names = new Set(catalog.books.map((book) => book.name.toLowerCase()));
  assert(names.size === 50, "expected unique titles");
});

test("catalog stock uses townforge book uuids", () => {
  const stock = buildCatalogStock(catalog, {
    priceMultiplier: 1,
    formatPrice: (cp) => `${cp} cp`
  });
  assert(stock.length === 50, "50 stock rows");
  assert(stock.every((entry) => entry.unlimited), "catalog books are unlimited");
  assert(stock.every((entry) => entry.uuid.startsWith("townforge-book:")), "uuid format");
});

test("book item data includes description and price", () => {
  const book = { ...catalog.books[0], catalogId: catalog.id };
  const data = buildBookItemData(book);
  assert(data.type === "loot", "loot item");
  assert(data.system.price.value === book.priceGP, "price");
  assert(data.system.description.value.includes(book.description), "description");
});

test("catalog is books-only", () => {
  assert(catalog.catalogOnly === true, "catalogOnly flag");
  assert(Array.isArray(catalog.compendiumBooks) && catalog.compendiumBooks.length > 0, "compendium books");
});

test("bookshop filters reject general store junk", () => {
  assert(isBookRelatedName("Spellbook"), "spellbook");
  assert(isBookRelatedName("The Ember Codex"), "codex title");
  assert(!isBookRelatedName("Dwarven Thrower"), "magic weapon");
  assert(!isBookRelatedName("Trident"), "weapon");
  assert(!isBookRelatedName("Torch"), "torch");
  assert(!isBookRelatedName("Tinderbox"), "tinderbox");
  assert(!isBookRelatedName("Fine Clothes"), "clothes");
  assert(
    inventoryHasNonBookEntries(
      [
        { name: "Torch", uuid: "Compendium.dnd5e.items.torch", source: "automatic" },
        { name: "Principles of Cantrip Craft", uuid: townforgeBookUuid("x"), source: "catalog" }
      ],
      catalog
    ),
    "detects mixed inventory"
  );
  assert(
    !inventoryHasNonBookEntries(
      [{ name: "Principles of Cantrip Craft", uuid: townforgeBookUuid("x"), source: "catalog" }],
      catalog
    ),
    "catalog-only inventory passes"
  );
  assert(
    isBookRelatedShopEntry({ name: "Spellbook", uuid: "Compendium.dnd5e.items.spellbook", source: "compendium" }),
    "compendium book entry"
  );
});

console.log(`\n${passed} tests passed`);
