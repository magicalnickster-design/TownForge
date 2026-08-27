/**
 * TownForge custom shop catalog tests.
 * Run: node tools/test_shop_catalog.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildBookItemData, buildCatalogStock, townforgeBookUuid } from "../scripts/shop-catalogs.js";

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

console.log(`\n${passed} tests passed`);
