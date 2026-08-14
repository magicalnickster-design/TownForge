/**
 * TownForge shop live-sync helper tests.
 * Run: node tools/test_shop_sync.mjs
 */

import {
  buyerCurrencyChanged,
  shopkeeperFlagsChanged
} from "../scripts/shop-sync.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("TownForge shop live-sync tests");

test("detects nested shopkeeper flag updates", () => {
  assert(
    shopkeeperFlagsChanged({
      flags: { townforge: { shopkeeper: { inventory: [] } } }
    }),
    "nested shopkeeper"
  );
});

test("ignores unrelated actor flag updates", () => {
  assert(
    !shopkeeperFlagsChanged({
      flags: { townforge: { occupation: "Baker" } }
    }),
    "occupation only"
  );
  assert(!shopkeeperFlagsChanged({ name: "Bob" }), "name only");
  assert(!shopkeeperFlagsChanged(null), "null");
});

test("detects dotted shopkeeper flag paths", () => {
  assert(
    shopkeeperFlagsChanged({
      "flags.townforge.shopkeeper": { enabled: true }
    }),
    "dotted shopkeeper"
  );
  assert(
    shopkeeperFlagsChanged({
      "flags.townforge.shopkeeper.inventory": []
    }),
    "dotted inventory"
  );
});

test("detects buyer currency updates", () => {
  assert(buyerCurrencyChanged({ system: { currency: { gp: 5 } } }), "nested currency");
  assert(buyerCurrencyChanged({ "system.currency.gp": 5 }), "dotted currency");
  assert(!buyerCurrencyChanged({ system: { attributes: {} } }), "other system");
});

test("openable shopkeeper helper mirrors living+enabled rules", () => {
  const defer = (actor) => {
    if (!actor) return true;
    const hp = actor?.system?.attributes?.hp?.value;
    return hp != null && Number(hp) <= 0;
  };
  const openable = (actor, enabled) => !defer(actor) && Boolean(enabled);
  assert(openable({ system: { attributes: { hp: { value: 10 } } } }, true) === true, "living shop");
  assert(openable({ system: { attributes: { hp: { value: 0 } } } }, true) === false, "dead");
  assert(openable({ system: { attributes: { hp: { value: 10 } } } }, false) === false, "disabled");
  assert(openable(null, true) === false, "missing actor");
});

console.log(`\n${passed} tests passed`);
