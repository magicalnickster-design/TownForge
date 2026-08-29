/**
 * TownForge shady lender catalog tests.
 * Run: node tools/test_shop_shady.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildCatalogStock,
  buildShadyItemData,
  inventoryViolatesCatalogOnly,
  townforgeShadyUuid
} from "../scripts/shop-catalogs.js";
import {
  isShadyIndexRow,
  isShadyRelatedName,
  isShadyRelatedShopEntry
} from "../scripts/shop-shady.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(__dirname, "../data/shop-catalogs/marrow-cline.json"), "utf8")
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

console.log("TownForge shady lender catalog tests");

test("marrow catalog has 3 custom shady goods with passives and images", () => {
  assert(catalog.shadyGoods.length === 3, "expected 3 shady goods");
  assert(catalog.shopName === "Suspicious Items Lender", "shop name");
  assert(catalog.catalogOnly === true, "catalogOnly");
  assert(catalog.shopType === "shady-lender", "shady-lender shop type");
  for (const good of catalog.shadyGoods) {
    assert(good.passive, `${good.id} missing passive`);
    assert(good.img?.endsWith(".svg"), `${good.id} missing svg image`);
  }
});

test("shady stock uses townforge shady uuids", () => {
  const stock = buildCatalogStock(catalog, {
    priceMultiplier: 1,
    formatPrice: (cp) => `${cp} cp`
  });
  assert(stock.length === 3, "3 stock rows");
  assert(stock.every((entry) => entry.uuid.startsWith("townforge-shady:")), "uuid format");
});

test("shady item data includes passive", () => {
  const good = { ...catalog.shadyGoods[0], catalogId: catalog.id };
  const data = buildShadyItemData(good);
  assert(data.type === "tool", "tool item");
  assert(data.system.description.value.includes("Passive:"), "passive text");
});

test("shady filters accept rogue gear and reject mundane stock", () => {
  assert(isShadyRelatedName("Manacles"), "manacles");
  assert(isShadyRelatedName("Thieves' Tools"), "thieves tools");
  assert(isShadyRelatedName("Crowbar"), "crowbar");
  assert(!isShadyRelatedName("Potion of Healing"), "healing potion excluded");
  assert(!isShadyRelatedName("Chain Mail"), "heavy gear excluded");
  assert(
    isShadyIndexRow({ name: "Disguise Kit", type: "tool" }),
    "disguise kit row"
  );
  assert(
    inventoryViolatesCatalogOnly(
      [
        { name: "Torch", uuid: "Compendium.dnd5e.items.torch", source: "automatic" },
        {
          name: "Debt-Marker Chalk",
          uuid: townforgeShadyUuid("debt-marker-chalk"),
          source: "catalog"
        }
      ],
      catalog
    ),
    "detects mixed shady inventory"
  );
  assert(
    isShadyRelatedShopEntry({
      name: "Manacles",
      uuid: "Compendium.dnd5e.items.manacles",
      source: "compendium"
    }),
    "compendium shady entry"
  );
});

console.log(`\n${passed} tests passed`);
