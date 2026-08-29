/**
 * TownForge grocer / food catalog tests.
 * Run: node tools/test_shop_food.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildCatalogStock,
  buildFoodItemData,
  inventoryViolatesCatalogOnly,
  townforgeFoodUuid
} from "../scripts/shop-catalogs.js";
import { isFoodRelatedName, isFoodRelatedShopEntry } from "../scripts/shop-foods.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(__dirname, "../data/shop-catalogs/garr-hopsack.json"), "utf8")
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

console.log("TownForge grocer catalog tests");

test("garr catalog has 10 custom foods with passives and images", () => {
  assert(catalog.foods.length === 10, "expected 10 foods");
  assert(catalog.catalogOnly === true, "catalogOnly");
  assert(catalog.shopType === "grocer", "grocer shop type");
  for (const food of catalog.foods) {
    assert(food.passive, `${food.id} missing passive`);
    assert(food.img?.endsWith(".svg"), `${food.id} missing svg image`);
  }
});

test("food stock uses townforge food uuids", () => {
  const stock = buildCatalogStock(catalog, {
    priceMultiplier: 1,
    formatPrice: (cp) => `${cp} cp`
  });
  assert(stock.length === 10, "10 stock rows");
  assert(stock.every((entry) => entry.uuid.startsWith("townforge-food:")), "uuid format");
});

test("food item data includes passive consumable", () => {
  const food = { ...catalog.foods[0], catalogId: catalog.id };
  const data = buildFoodItemData(food);
  assert(data.type === "consumable", "consumable");
  assert(data.system.type.value === "food", "food subtype");
  assert(data.system.description.value.includes("Passive:"), "passive text");
  assert(data.system.description.value.includes(food.passive), "passive body");
});

test("grocer filters reject weapons and accept provisions", () => {
  assert(isFoodRelatedName("Rations (1 day)"), "rations");
  assert(isFoodRelatedName("Amber Harvest Flatbread"), "flatbread");
  assert(!isFoodRelatedName("Dwarven Thrower"), "weapon");
  assert(!isFoodRelatedName("Trident"), "trident");
  assert(
    inventoryViolatesCatalogOnly(
      [
        { name: "Torch", uuid: "Compendium.dnd5e.items.torch", source: "automatic" },
        { name: "Honey Oat Bites", uuid: townforgeFoodUuid("honey-oat-bites"), source: "catalog" }
      ],
      catalog
    ),
    "detects mixed grocer inventory"
  );
  assert(
    isFoodRelatedShopEntry({
      name: "Rations",
      uuid: "Compendium.dnd5e.items.rations",
      source: "compendium"
    }),
    "compendium food entry"
  );
});

console.log(`\n${passed} tests passed`);
