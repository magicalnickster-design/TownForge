/**
 * TownForge tailor / apparel catalog tests.
 * Run: node tools/test_shop_apparel.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildApparelItemData,
  buildCatalogStock,
  inventoryViolatesCatalogOnly,
  townforgeApparelUuid
} from "../scripts/shop-catalogs.js";
import {
  isApparelIndexRow,
  isApparelRelatedName,
  isApparelRelatedShopEntry,
  rowArmorType
} from "../scripts/shop-apparel.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(__dirname, "../data/shop-catalogs/hedda-loom.json"), "utf8")
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

console.log("TownForge apparel catalog tests");

test("hedda catalog has 10 custom pieces with passives and images", () => {
  assert(catalog.apparel.length === 10, "expected 10 apparel items");
  assert(catalog.catalogOnly === true, "catalogOnly");
  assert(catalog.shopType === "tailor", "tailor shop type");
  const topics = new Set(catalog.apparel.map((piece) => piece.topic));
  assert(topics.has("jewelry"), "jewelry");
  assert(topics.has("footwear"), "footwear");
  for (const piece of catalog.apparel) {
    assert(piece.passive, `${piece.id} missing passive`);
    assert(piece.img?.endsWith(".svg"), `${piece.id} missing svg image`);
  }
});

test("apparel stock uses townforge apparel uuids", () => {
  const stock = buildCatalogStock(catalog, {
    priceMultiplier: 1,
    formatPrice: (cp) => `${cp} cp`
  });
  assert(stock.length === 10, "10 stock rows");
  assert(stock.every((entry) => entry.uuid.startsWith("townforge-apparel:")), "uuid format");
});

test("apparel item data includes passive equipment", () => {
  const piece = { ...catalog.apparel[0], catalogId: catalog.id };
  const data = buildApparelItemData(piece);
  assert(data.type === "equipment", "equipment");
  assert(data.system.armor.type === "clothing", "clothing armor type");
  assert(data.system.description.value.includes("Passive:"), "passive text");
});

test("apparel filters accept clothing and light armor only", () => {
  assert(isApparelRelatedName("Fine Clothes"), "fine clothes");
  assert(isApparelRelatedName("Leather Armor"), "leather armor");
  assert(isApparelRelatedName("Studded Leather"), "studded leather");
  assert(!isApparelRelatedName("Chain Shirt"), "medium armor excluded");
  assert(!isApparelRelatedName("Dwarven Thrower"), "weapon excluded");
  assert(
    isApparelIndexRow({
      name: "Padded Armor",
      type: "equipment",
      system: { armor: { type: "light" } }
    }),
    "light armor row"
  );
  assert(rowArmorType({ system: { armor: { type: "clothing" } } }) === "clothing", "row armor type");
  assert(
    inventoryViolatesCatalogOnly(
      [
        { name: "Longsword", uuid: "Compendium.dnd5e.items.longsword", source: "automatic" },
        { name: "Moonthread Stud Earrings", uuid: townforgeApparelUuid("moonthread-stud-earrings"), source: "catalog" }
      ],
      catalog
    ),
    "detects mixed tailor inventory"
  );
  assert(
    isApparelRelatedShopEntry({
      name: "Common Clothes",
      uuid: "Compendium.dnd5e.items.common-clothes",
      source: "compendium"
    }),
    "compendium clothing entry"
  );
});

console.log(`\n${passed} tests passed`);
