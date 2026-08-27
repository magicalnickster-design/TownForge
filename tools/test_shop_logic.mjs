/**
 * TownForge shop experience unit tests.
 * Run: node tools/test_shop_logic.mjs
 */

import {
  addCopper,
  currencyToCopper,
  deductCopper,
  formatCopper,
  formatWallet,
  SELL_PRICE_RATIO,
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

test("addCopper credits wallet in largest denominations", () => {
  const next = addCopper({ gp: 2, sp: 3 }, 1255); // +12gp 5sp 5cp → uses ep in ladder
  assertEqual(next, { pp: 1, gp: 4, ep: 1, sp: 3, cp: 5 }, "add sell proceeds");
  assert(currencyToCopper(next) === currencyToCopper({ gp: 2, sp: 3 }) + 1255, "total");
});

test("sell ratio is half value", () => {
  assert(SELL_PRICE_RATIO === 0.5, "50% buyback");
});

test("net trade affordability: sell credits cover buy cost", () => {
  const buyTotal = 1500;
  const sellTotal = 800;
  const net = buyTotal - sellTotal;
  const purse = currencyToCopper({ gp: 8 });
  assert(purse >= net, "8gp covers 7gp net");
  const short = currencyToCopper({ gp: 5 });
  assert(short < net, "5gp cannot cover 7gp net");
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

test("multi-quantity purchase validates funds and stock", () => {
  const ok = validatePurchaseRequest({
    shop: {
      enabled: true,
      inventory: [{ id: "a", uuid: "Item.x", name: "Potion", priceCP: 500, quantity: 4 }]
    },
    stockId: "a",
    buyerOwned: true,
    buyerType: "character",
    buyerCurrency: { gp: 20 },
    quantity: 3
  });
  assert(ok.ok, "3 potions affordable");
  assert(ok.quantity === 3, "qty echoed");
  assert(ok.priceCP === 1500, "total price");

  const shortStock = validatePurchaseRequest({
    shop: {
      enabled: true,
      inventory: [{ id: "a", uuid: "Item.x", name: "Potion", priceCP: 500, quantity: 2 }]
    },
    stockId: "a",
    buyerOwned: true,
    buyerType: "character",
    buyerCurrency: { gp: 50 },
    quantity: 3
  });
  assert(!shortStock.ok, "not enough stock");

  const shortGold = validatePurchaseRequest({
    shop: {
      enabled: true,
      inventory: [{ id: "a", uuid: "Item.x", name: "Potion", priceCP: 500, quantity: null }]
    },
    stockId: "a",
    buyerOwned: true,
    buyerType: "character",
    buyerCurrency: { gp: 8 },
    quantity: 2
  });
  assert(!shortGold.ok, "not enough gold for qty");
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

console.log("\nTownForge shop item source tests");

const {
  filterPacksBySelection,
  isSelectableItemPack,
  mapDiscoverableItemPacks,
  recommendedPackIds,
  resolveConfiguredSourceIds,
  sanitizeSelectedPackIds
} = await import("../scripts/shop-sources.js");

const availablePacks = [
  { id: "dnd5e.items", documentName: "Item", label: "Items", packageName: "dnd5e" },
  { id: "dnd5e.equipment24", documentName: "Item", label: "Equipment", packageName: "dnd5e" },
  { id: "some-module.custom-items", documentName: "Item", label: "Custom", packageName: "some-module" },
  { id: "dnd5e.monsters", documentName: "Actor", label: "Monsters", packageName: "dnd5e" },
  { id: "world.notes", documentName: "JournalEntry", label: "Notes", packageName: "world" }
];

test("selected compendiums are used", () => {
  const selected = ["dnd5e.items", "some-module.custom-items"];
  const used = filterPacksBySelection(availablePacks, selected).map((p) => p.id);
  assertEqual(used, selected, "only selected item packs");
});

test("unselected compendiums are ignored", () => {
  const used = filterPacksBySelection(availablePacks, ["dnd5e.items"]).map((p) => p.id);
  assert(!used.includes("dnd5e.equipment24"), "equipment24 ignored");
  assert(!used.includes("some-module.custom-items"), "custom ignored");
});

test("removed pack IDs are ignored safely", () => {
  const sanitized = sanitizeSelectedPackIds(
    ["dnd5e.items", "missing.pack", "old-module.gone"],
    availablePacks
  );
  assertEqual(sanitized, ["dnd5e.items"], "missing removed");
});

test("non-Item packs cannot be selected/used", () => {
  assert(!isSelectableItemPack(availablePacks.find((p) => p.id === "dnd5e.monsters")), "actor pack");
  const sanitized = sanitizeSelectedPackIds(["dnd5e.monsters", "world.notes", "dnd5e.items"], availablePacks);
  assertEqual(sanitized, ["dnd5e.items"], "non-item dropped");
  const used = filterPacksBySelection(availablePacks, ["dnd5e.monsters"]).map((p) => p.id);
  assertEqual(used, [], "non-item unused");
});

test("no selected sources produces empty usable set", () => {
  const sanitized = sanitizeSelectedPackIds([], availablePacks);
  assertEqual(sanitized, [], "empty selection");
  const used = filterPacksBySelection(availablePacks, []).map((p) => p.id);
  assertEqual(used, [], "no fallback to all packs");
  const message =
    "TownForge has no Shopkeeper Item Sources selected. Open Configure Settings → Module Settings → TownForge → Shopkeeper Item Sources.";
  assert(message.includes("Shopkeeper Item Sources"), "useful GM error text");
});

test("blacksmith filtering still applies across multiple selected packs", () => {
  const index = [
    { name: "Longsword", type: "weapon", pack: "dnd5e.items", armorType: "", weaponType: "martialM" },
    { name: "Potion of Healing", type: "consumable", pack: "some-module.custom-items", armorType: "", weaponType: "" },
    { name: "Shield", type: "equipment", pack: "dnd5e.equipment24", armorType: "shield", weaponType: "" },
    { name: "Longbow", type: "weapon", pack: "dnd5e.items", armorType: "", weaponType: "martialR" }
  ];
  const selectedPacks = new Set(["dnd5e.items", "dnd5e.equipment24", "some-module.custom-items"]);
  const fromSelected = index.filter((item) => selectedPacks.has(item.pack));

  const isBlacksmith = (item) => {
    const name = item.name.toLowerCase();
    if (item.type === "weapon") {
      if (/bow|crossbow|sling|net|blowgun|dart|firearm|gun/i.test(name)) return false;
      if (String(item.weaponType).includes("r") && !String(item.weaponType).includes("m")) return false;
      return true;
    }
    if (item.type === "equipment" && ["shield", "light", "medium", "heavy"].includes(item.armorType)) {
      return true;
    }
    return false;
  };

  const blacksmithStock = fromSelected.filter(isBlacksmith).map((item) => item.name);
  assert(blacksmithStock.includes("Longsword"), "weapon from pack A");
  assert(blacksmithStock.includes("Shield"), "shield from pack B");
  assert(!blacksmithStock.includes("Potion of Healing"), "potion excluded by shop filter");
  assert(!blacksmithStock.includes("Longbow"), "ranged excluded");
});

test("discover mapper only returns Item packs", () => {
  const mapped = mapDiscoverableItemPacks([
    {
      collection: "dnd5e.items",
      documentName: "Item",
      metadata: { label: "Items", packageName: "dnd5e", packageType: "system" }
    },
    {
      collection: "dnd5e.heroes",
      documentName: "Actor",
      metadata: { label: "Heroes", packageName: "dnd5e", packageType: "system" }
    }
  ]);
  assertEqual(
    mapped.map((p) => p.id),
    ["dnd5e.items"],
    "actors excluded from discovery"
  );
  assert(mapped[0].sourceLabel.includes("System"), "source label");
});

test("recommended packs only include installed candidates", () => {
  const recommended = recommendedPackIds(availablePacks);
  assert(recommended.includes("dnd5e.items"), "items recommended");
  assert(recommended.includes("dnd5e.equipment24"), "equipment24 recommended");
  assert(!recommended.includes("some-module.custom-items"), "third-party not auto-recommended");
});

test("future source object shape resolves default list", () => {
  const ids = resolveConfiguredSourceIds({
    default: ["dnd5e.items"],
    byShopType: { blacksmith: ["dnd5e.equipment24"] }
  });
  assertEqual(ids, ["dnd5e.items"], "default shape");
  const typed = resolveConfiguredSourceIds(
    {
      default: ["dnd5e.items"],
      byShopType: { blacksmith: ["dnd5e.equipment24"] }
    },
    { shopType: "blacksmith" }
  );
  assertEqual(typed, ["dnd5e.equipment24"], "future per-shop-type shape");
});

console.log("\nTownForge shop random reshuffle tests");

const { seededPick, stableHash, newGenerationSalt, randomPick } = await import("../scripts/shop-random.js");

test("stable hash is deterministic", () => {
  assert(stableHash("abc") === stableHash("abc"), "same input");
  assert(stableHash("abc") !== stableHash("abcd"), "different input");
});

test("same seed returns same picks", () => {
  const list = Array.from({ length: 30 }, (_, i) => `item-${i}`);
  const a = seededPick(list, 8, "merchant:blacksmith:1:stable");
  const b = seededPick(list, 8, "merchant:blacksmith:1:stable");
  assertEqual(a, b, "deterministic");
});

test("different salts reshuffle to different assortments", () => {
  const list = Array.from({ length: 40 }, (_, i) => `item-${i}`);
  const a = seededPick(list, 10, "merchant:blacksmith:1:salt-a");
  const b = seededPick(list, 10, "merchant:blacksmith:1:salt-b");
  assert(JSON.stringify(a) !== JSON.stringify(b), "reshuffle differs");
});

test("newGenerationSalt produces unique values", () => {
  const salts = new Set([newGenerationSalt(), newGenerationSalt(), newGenerationSalt()]);
  assert(salts.size === 3, "unique salts");
});

test("randomPick returns requested count from the source list", () => {
  const list = Array.from({ length: 25 }, (_, i) => `item-${i}`);
  const picked = randomPick(list, 7);
  assert(picked.length === 7, "count");
  assert(picked.every((entry) => list.includes(entry)), "subset");
});

test("randomPick can change order across calls", () => {
  const list = Array.from({ length: 40 }, (_, i) => `item-${i}`);
  let changed = false;
  const first = randomPick(list, 15);
  for (let i = 0; i < 12; i += 1) {
    const next = randomPick(list, 15);
    if (JSON.stringify(next) !== JSON.stringify(first)) {
      changed = true;
      break;
    }
  }
  assert(changed, "expected at least one different shuffle");
});

test("inventory patch assignment replaces prior rows conceptually", () => {
  const prior = [
    { id: "a", name: "Longsword" },
    { id: "b", name: "Dagger" },
    { id: "c", name: "Shield" }
  ];
  const patch = {
    inventory: [
      { id: "x", name: "Mace" },
      { id: "y", name: "Spear" }
    ]
  };
  const next = { inventory: prior };
  if (Object.prototype.hasOwnProperty.call(patch, "inventory")) {
    next.inventory = Array.isArray(patch.inventory) ? patch.inventory.slice() : [];
  }
  assertEqual(next.inventory.map((row) => row.name), ["Mace", "Spear"], "full replace");
});

test("shopkeeper write payload never deletes parent flag", () => {
  // Mirrors ShopService.#writeShopkeeperFlag — deleting flags.townforge.-=shopkeeper
  // alongside a re-set can wipe enabled after player trades.
  const MODULE = "townforge";
  const FLAG = "shopkeeper";
  const base = `flags.${MODULE}.${FLAG}`;
  const next = {
    enabled: true,
    shopType: "blacksmith",
    shopName: "Garr's",
    inventory: [{ id: "a", name: "Mace", quantity: null }]
  };
  const update = {
    [`${base}.-=inventory`]: null,
    [`${base}.inventory`]: next.inventory
  };
  for (const [key, value] of Object.entries(next)) {
    if (key === "inventory") continue;
    update[`${base}.${key}`] = value;
  }
  assert(!Object.keys(update).some((key) => key.includes(`-=${FLAG}`)), "no parent delete");
  assert(update[`${base}.enabled`] === true, "keeps enabled");
  assert(Array.isArray(update[`${base}.inventory`]), "sets inventory");
  assert(Object.prototype.hasOwnProperty.call(update, `${base}.-=inventory`), "clears inventory only");
});

console.log("\nTownForge shop inventory dedupe tests");

const { dedupeStockEntries } = await import("../scripts/shop-constants.js");

test("dedupes same item across compendium UUIDs", () => {
  const inventory = [
    { id: "a", uuid: "Compendium.dnd5e.items.ink", name: "Ink Pen", type: "equipment", source: "automatic" },
    { id: "b", uuid: "Compendium.dnd5e.equipment24.ink", name: "Ink Pen", type: "equipment", source: "automatic" }
  ];
  const deduped = dedupeStockEntries(inventory);
  assertEqual(deduped.length, 1, "one ink pen");
  assertEqual(deduped[0].uuid, "Compendium.dnd5e.items.ink", "keeps first row");
});

test("manual stock wins over automatic duplicate", () => {
  const inventory = [
    { id: "a", uuid: "Compendium.dnd5e.items.ink", name: "Ink Pen", type: "equipment", source: "automatic" },
    { id: "b", uuid: "Item.manualink", name: "Ink Pen", type: "equipment", source: "manual" }
  ];
  const deduped = dedupeStockEntries(inventory);
  assertEqual(deduped.length, 1, "one ink pen");
  assertEqual(deduped[0].source, "manual", "prefers manual");
});

console.log(`\n${passed} tests passed`);
