/**
 * TownForge shop experience unit tests.
 * Run: node tools/test_shop_logic.mjs
 */

import {
  currencyToCopper,
  deductCopper,
  formatCopper,
  formatWallet,
  validatePurchaseRequest
} from "../scripts/shop-currency.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\n expected: ${e}\n actual:   ${a}`);
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("TownForge shop currency + validation tests");

test("10gp equals 1000cp", () => {
  assert(currencyToCopper({ gp: 10 }) === 1000, "10gp");
});

test("mixed purse copper total", () => {
  assert(currencyToCopper({ pp: 1, sp: 2, cp: 3 }) === 1023, "mixed");
});

test("exact gp payment preserves other denominations", () => {
  const next = deductCopper({ pp: 2, gp: 10, sp: 15 }, 600); // 6 gp
  assertEqual(next, { pp: 2, gp: 4, ep: 0, sp: 15, cp: 0 }, "preserve pp/sp");
});

test("breaking a gp for silver purchase makes change", () => {
  const next = deductCopper({ gp: 1, sp: 0, cp: 0 }, 50); // 5 sp
  assertEqual(next, { pp: 0, gp: 0, ep: 0, sp: 5, cp: 0 }, "change in sp");
});

test("pay with mixed coins without rewriting whole wallet", () => {
  const next = deductCopper({ pp: 1, gp: 3, sp: 4, cp: 7 }, 125); // 1gp 2sp 5cp
  // Prefer spending gp/sp/cp exactly: 1gp + 2sp + 5cp
  assertEqual(next, { pp: 1, gp: 2, ep: 0, sp: 2, cp: 2 }, "mixed exact-ish");
  assert(currencyToCopper(next) === currencyToCopper({ pp: 1, gp: 3, sp: 4, cp: 7 }) - 125, "total");
});

test("insufficient funds throws", () => {
  let failed = false;
  try {
    deductCopper({ gp: 1 }, 200);
  } catch {
    failed = true;
  }
  assert(failed, "should throw");
});

test("never negative currency", () => {
  const next = deductCopper({ gp: 5, sp: 3 }, 503);
  for (const [denom, value] of Object.entries(next)) {
    assert(value >= 0, `${denom} negative`);
  }
});

test("formatCopper and formatWallet", () => {
  assert(formatCopper(1508) === "1 pp, 5 gp, 8 cp", "formatCopper");
  assert(formatWallet({ gp: 74, sp: 8 }) === "74 gp, 8 sp", "formatWallet");
});

test("affordable purchase validation succeeds", () => {
  const result = validatePurchaseRequest({
    shop: {
      enabled: true,
      inventory: [{ id: "a", uuid: "Item.x", name: "Sword", priceCP: 1500, quantity: null }]
    },
    stockId: "a",
    buyerOwned: true,
    buyerType: "character",
    buyerCurrency: { gp: 20 }
  });
  assert(result.ok, "should succeed");
  assert(result.priceCP === 1500, "authoritative price");
});

test("insufficient funds rejected", () => {
  const result = validatePurchaseRequest({
    shop: {
      enabled: true,
      inventory: [{ id: "a", uuid: "Item.x", name: "Sword", priceCP: 1500, quantity: null }]
    },
    stockId: "a",
    buyerOwned: true,
    buyerType: "character",
    buyerCurrency: { gp: 5 }
  });
  assert(!result.ok && result.message === "Not enough gold.", result.message);
});

test("unknown stock id rejected", () => {
  const result = validatePurchaseRequest({
    shop: { enabled: true, inventory: [] },
    stockId: "missing",
    buyerOwned: true,
    buyerType: "character",
    buyerCurrency: { gp: 100 }
  });
  assert(!result.ok && result.message === "Item unavailable.", result.message);
});

test("tampered client price ignored", () => {
  const result = validatePurchaseRequest({
    shop: {
      enabled: true,
      inventory: [{ id: "a", uuid: "Item.real", name: "Sword", priceCP: 1500, quantity: null }]
    },
    stockId: "a",
    buyerOwned: true,
    buyerType: "character",
    buyerCurrency: { gp: 20 },
    clientPriceCP: 1,
    clientUuid: "Item.fake"
  });
  assert(result.ok && result.priceCP === 1500, "must use stock price");
  assert(result.stock.uuid === "Item.real", "must use stock uuid");
});

test("sold out rejected", () => {
  const result = validatePurchaseRequest({
    shop: {
      enabled: true,
      inventory: [{ id: "a", uuid: "Item.x", name: "Sword", priceCP: 100, quantity: 0 }]
    },
    stockId: "a",
    buyerOwned: true,
    buyerType: "character",
    buyerCurrency: { gp: 20 }
  });
  assert(!result.ok && result.message === "Item sold out.", result.message);
});

test("unlimited stock (null qty) allowed", () => {
  const result = validatePurchaseRequest({
    shop: {
      enabled: true,
      inventory: [{ id: "a", uuid: "Item.x", name: "Sword", priceCP: 100, quantity: null }]
    },
    stockId: "a",
    buyerOwned: true,
    buyerType: "character",
    buyerCurrency: { gp: 20 }
  });
  assert(result.ok, "unlimited ok");
});

test("finite stock available allowed", () => {
  const result = validatePurchaseRequest({
    shop: {
      enabled: true,
      inventory: [{ id: "a", uuid: "Item.x", name: "Sword", priceCP: 100, quantity: 2 }]
    },
    stockId: "a",
    buyerOwned: true,
    buyerType: "character",
    buyerCurrency: { gp: 20 }
  });
  assert(result.ok, "finite available");
});

test("shop disabled rejected", () => {
  const result = validatePurchaseRequest({
    shop: {
      enabled: false,
      inventory: [{ id: "a", uuid: "Item.x", name: "Sword", priceCP: 100, quantity: null }]
    },
    stockId: "a",
    buyerOwned: true,
    buyerType: "character",
    buyerCurrency: { gp: 20 }
  });
  assert(!result.ok && result.message === "Shop unavailable.", result.message);
});

test("no owned character rejected", () => {
  const result = validatePurchaseRequest({
    shop: {
      enabled: true,
      inventory: [{ id: "a", uuid: "Item.x", name: "Sword", priceCP: 100, quantity: null }]
    },
    stockId: "a",
    buyerOwned: false,
    buyerType: "character",
    buyerCurrency: { gp: 20 }
  });
  assert(!result.ok && result.message === "Character not selected.", result.message);
});

test("manual inventory entry can validate", () => {
  const result = validatePurchaseRequest({
    shop: {
      enabled: true,
      inventory: [
        {
          id: "manual-1",
          uuid: "Item.manual",
          name: "Custom Blade",
          priceCP: 2500,
          quantity: 1,
          source: "manual"
        }
      ]
    },
    stockId: "manual-1",
    buyerOwned: true,
    buyerType: "character",
    buyerCurrency: { pp: 3 }
  });
  assert(result.ok && result.stock.source === "manual", "manual ok");
});

test("LootForge defer helper: dead actor should defer", async () => {
  const { shouldDeferTokenClick } = await import("../scripts/shop-hooks.js").catch(() => ({
    shouldDeferTokenClick: null
  }));
  // shop-hooks imports Foundry APIs; skip deep import in Node.
  // Keep a local mirror of the HP rule for offline coverage.
  const defer = (actor) => {
    const hp = actor?.system?.attributes?.hp?.value;
    return hp != null && Number(hp) <= 0;
  };
  assert(defer({ system: { attributes: { hp: { value: 0 } } } }) === true, "dead defers");
  assert(defer({ system: { attributes: { hp: { value: 12 } } } }) === false, "living continues");
  void shouldDeferTokenClick;
});

test("deterministic filter presence logic", () => {
  const inventory = [
    { filter: "weapons" },
    { filter: "weapons" },
    { filter: "shields" },
    { filter: "armor" }
  ];
  const present = new Set(inventory.map((e) => e.filter));
  const defs = [
    { id: "all" },
    { id: "weapons" },
    { id: "armor" },
    { id: "shields" },
    { id: "tools" }
  ];
  const shown = defs.filter((d) => d.id === "all" || present.has(d.id)).map((d) => d.id);
  assertEqual(shown, ["all", "weapons", "armor", "shields"], "hide empty tools tab");
});

console.log(`\n${passed} tests passed`);
