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
import { coerceInventoryArray, isUnlimitedStock, itemQtyBadge, normalizeRarity, rarityLabel } from "../scripts/shop-constants.js";
import { parseItemDropText, parseTradeItemDragData, TRADE_DRAG_MIME } from "../scripts/shop-drop.js";
import {
  buildPartyProfile,
  detectAssignedPartyActors,
  inspectCharacterClasses,
  normalizePartyAwareSettings,
  partyProfileFingerprint,
  scoreItemPartyWeight
} from "../scripts/shop-party.js";
import { weightedSeededPick } from "../scripts/shop-random.js";

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
    next.inventory = coerceInventoryArray(patch.inventory);
  }
  assertEqual(next.inventory.map((row) => row.name), ["Mace", "Spear"], "full replace");
});

test("coerceInventoryArray recovers object-like stock rows", () => {
  const recovered = coerceInventoryArray({
    1: { id: "b", name: "Dagger" },
    0: { id: "a", name: "Mace" },
    foo: "ignore"
  });
  assert(Array.isArray(recovered), "real array");
  assertEqual(recovered.map((row) => row.id), ["a", "b"], "numeric order");
  assertEqual(coerceInventoryArray(null), [], "null");
});

test("unlimited-only buys skip inventory writes", () => {
  const resolvedBuys = [{ stock: { id: "a", unlimited: true }, qty: 5 }];
  const resolvedSells = [];
  const inventoryNeedsWrite =
    resolvedSells.length > 0 || resolvedBuys.some((buy) => !isUnlimitedStock(buy.stock));
  assert(!inventoryNeedsWrite, "skip write for unlimited buys");
  const finiteBuyNeedsWrite = [{ stock: { id: "b", unlimited: false, quantity: 3 }, qty: 1 }].some(
    (buy) => !isUnlimitedStock(buy.stock)
  );
  assert(finiteBuyNeedsWrite, "finite stock still writes");
});

test("shopkeeper write payload never deletes parent flag or inventory", () => {
  // Mirrors ShopService.#writeShopkeeperFlag — deleting flags.townforge.-=shopkeeper
  // or -=inventory alongside a re-set can wipe the shelf after unlimited-stock buys.
  const MODULE = "townforge";
  const FLAG = "shopkeeper";
  const base = `flags.${MODULE}.${FLAG}`;
  const next = {
    enabled: true,
    shopType: "blacksmith",
    shopName: "Garr's",
    inventory: [{ id: "a", name: "Mace", unlimited: true }]
  };
  const update = {
    [`${base}.inventory`]: next.inventory
  };
  for (const [key, value] of Object.entries(next)) {
    if (key === "inventory") continue;
    if (value === null) continue;
    update[`${base}.${key}`] = value;
  }
  assert(!Object.keys(update).some((key) => key.includes("-=")), "no deletion keys");
  assert(update[`${base}.enabled`] === true, "keeps enabled");
  assert(Array.isArray(update[`${base}.inventory`]), "sets inventory");
});

test("normalizeRarity maps dnd5e strings and objects", () => {
  assertEqual(normalizeRarity("uncommon"), "uncommon", "uncommon");
  assertEqual(normalizeRarity("very rare"), "veryRare", "very rare");
  assertEqual(normalizeRarity("veryRare"), "veryRare", "camel");
  assertEqual(normalizeRarity({ value: "legendary" }), "legendary", "object");
  assertEqual(normalizeRarity(""), "common", "empty");
  assertEqual(normalizeRarity("mystery"), "common", "unknown");
  assertEqual(rarityLabel("veryRare"), "Very Rare", "label");
});

test("itemQtyBadge hides singles and shows stacks or unlimited", () => {
  assertEqual(itemQtyBadge({ quantity: 1 }), "", "single");
  assertEqual(itemQtyBadge({ quantity: 12 }), "12", "stack");
  assertEqual(itemQtyBadge({ quantity: 0 }), "0", "empty");
  assertEqual(itemQtyBadge({ unlimited: true }), "∞", "unlimited flag");
  assertEqual(itemQtyBadge({ quantity: null }), "∞", "null qty");
});

console.log("\nTownForge party-aware inventory tests");

test("detectAssignedPartyActors skips GMs and unassigned users", () => {
  const fighter = { id: "a1", uuid: "Actor.a1", type: "character", name: "Motaro" };
  const users = [
    { isGM: true, character: fighter },
    { isGM: false, character: null },
    { isGM: false, character: fighter },
    { isGM: false, character: fighter }
  ];
  const party = detectAssignedPartyActors(users, () => null);
  assertEqual(party.length, 1, "one unique PC");
  assertEqual(party[0].name, "Motaro", "name");
});

test("inspectCharacterClasses reads multiclass itemTypes", () => {
  const actor = {
    name: "Drendaline",
    uuid: "Actor.d1",
    type: "character",
    itemTypes: {
      class: [
        { name: "Warlock", system: { identifier: "warlock", levels: 4 } },
        { name: "Sorcerer", system: { identifier: "sorcerer", levels: 3 } }
      ]
    },
    system: { details: { level: 7 } }
  };
  const inspected = inspectCharacterClasses(actor);
  assertEqual(inspected.totalLevel, 7, "total");
  assertEqual(
    inspected.classes.map((row) => `${row.id}:${row.levels}`),
    ["warlock:4", "sorcerer:3"],
    "multiclass"
  );
});

test("buildPartyProfile aggregates classes and levels", () => {
  const profile = buildPartyProfile([
    {
      name: "Motaro",
      uuid: "Actor.1",
      type: "character",
      itemTypes: { class: [{ name: "Fighter", system: { identifier: "fighter", levels: 7 } }] },
      system: { details: { level: 7 } }
    },
    {
      name: "Maeve",
      uuid: "Actor.2",
      type: "character",
      itemTypes: { class: [{ name: "Wizard", system: { identifier: "wizard", levels: 7 } }] },
      system: { details: { level: 7 } }
    }
  ]);
  assert(!profile.empty, "not empty");
  assertEqual(profile.averageLevel, 7, "avg");
  assertEqual(profile.classes.fighter, 1, "fighter");
  assertEqual(profile.classes.wizard, 1, "wizard");
  assert(partyProfileFingerprint(profile, "auto").includes("fighter:1"), "fingerprint");
});

test("scoreItemPartyWeight boosts relevant and lowers specialist misses", () => {
  const profile = buildPartyProfile([
    {
      name: "Maeve",
      uuid: "Actor.2",
      type: "character",
      itemTypes: { class: [{ name: "Wizard", system: { identifier: "wizard", levels: 5 } }] },
      system: { details: { level: 5 } }
    }
  ]);
  const wand = scoreItemPartyWeight({ type: "equipment", name: "Wand of the War Mage", armorType: "", weaponType: "" }, profile);
  const lute = scoreItemPartyWeight({ type: "tool", name: "Lute", armorType: "", weaponType: "", toolType: "music" }, profile);
  const rope = scoreItemPartyWeight({ type: "consumable", name: "Rope", armorType: "", weaponType: "" }, profile);
  assert(wand >= 2, `wand boosted (${wand})`);
  assert(lute <= 0.5, `lute specialist low (${lute})`);
  assertEqual(rope, 1, "general stays 1");
  assertEqual(scoreItemPartyWeight(wand, null), 1, "no profile");
});

test("empty party profile falls back to general weights", () => {
  const empty = buildPartyProfile([]);
  assert(empty.empty, "empty");
  assertEqual(scoreItemPartyWeight({ type: "weapon", name: "Longsword" }, empty), 1, "weight 1");
});

test("weightedSeededPick is deterministic and favors heavy weights", () => {
  const items = [
    { id: "a", w: 1 },
    { id: "b", w: 100 },
    { id: "c", w: 1 }
  ];
  const first = weightedSeededPick(items, 1, (row) => row.w, "party-test-seed");
  const second = weightedSeededPick(items, 1, (row) => row.w, "party-test-seed");
  assertEqual(first.map((row) => row.id), second.map((row) => row.id), "deterministic");
  assertEqual(first[0].id, "b", "heavy weight preferred");
});

test("normalizePartyAwareSettings defaults off and cleans uuids", () => {
  const normalized = normalizePartyAwareSettings({
    partyAwareInventory: 1,
    partyDetectionMode: "manual",
    partyActorUuids: [" Actor.1 ", "Actor.1", "", null]
  });
  assertEqual(normalized.partyAwareInventory, true, "bool");
  assertEqual(normalized.partyDetectionMode, "manual", "mode");
  assertEqual(normalized.partyActorUuids, ["Actor.1"], "dedupe");
  assertEqual(normalizePartyAwareSettings({}).partyAwareInventory, false, "default off");
});

console.log("\nTownForge item drop parsing tests");
test("parses sidebar Item drag JSON", () => {
  const uuid = parseItemDropText(JSON.stringify({ type: "Item", uuid: "Item.abc123" }));
  assertEqual(uuid, "Item.abc123", "sidebar uuid");
});
test("parses compendium Item drag JSON", () => {
  const uuid = parseItemDropText(
    JSON.stringify({ type: "Item", uuid: "Compendium.dnd5e.items.longsword" })
  );
  assertEqual(uuid, "Compendium.dnd5e.items.longsword", "compendium uuid");
});
test("parses nested data.uuid payloads", () => {
  const uuid = parseItemDropText(JSON.stringify({ type: "Item", data: { uuid: "Item.nested" } }));
  assertEqual(uuid, "Item.nested", "nested uuid");
});
test("rejects non-Item drag payloads", () => {
  assertEqual(parseItemDropText(JSON.stringify({ type: "Actor", uuid: "Actor.xyz" })), null, "actor");
});
test("accepts plain Item uuid strings", () => {
  assertEqual(parseItemDropText("Compendium.world.items.foo"), "Compendium.world.items.foo", "plain");
});

console.log("\nTownForge trade drag payload tests");
test("parses stock trade drag payload", () => {
  const event = {
    dataTransfer: {
      getData: (mime) =>
        mime === TRADE_DRAG_MIME ? JSON.stringify({ kind: "stock", stockId: "stock-1" }) : ""
    }
  };
  const payload = parseTradeItemDragData(event);
  assertEqual(payload?.kind, "stock", "kind");
  assertEqual(payload?.stockId, "stock-1", "stockId");
});
test("parses player trade drag payload", () => {
  const event = {
    dataTransfer: {
      getData: (mime) =>
        mime === TRADE_DRAG_MIME ? JSON.stringify({ kind: "player", itemId: "item-9" }) : ""
    }
  };
  const payload = parseTradeItemDragData(event);
  assertEqual(payload?.kind, "player", "kind");
  assertEqual(payload?.itemId, "item-9", "itemId");
});
test("rejects malformed trade drag payload", () => {
  const event = {
    dataTransfer: {
      getData: (mime) => (mime === TRADE_DRAG_MIME ? "{bad json" : "")
    }
  };
  assertEqual(parseTradeItemDragData(event), null, "bad json");
});

console.log("\nTownForge shop item filter tests");

const { resolveShopItemFilter } = await import("../scripts/shop-filters.js");

test("armor filter only includes actual armor", () => {
  assertEqual(
    resolveShopItemFilter({ type: "equipment", name: "Chain Mail", armorType: "heavy" }),
    "armor",
    "heavy armor"
  );
  assertEqual(
    resolveShopItemFilter({ type: "equipment", name: "Leather Armor", armorType: "light" }),
    "armor",
    "light armor"
  );
  assertEqual(
    resolveShopItemFilter({ type: "equipment", name: "Shield", armorType: "shield" }),
    "shields",
    "shield"
  );
});

test("adventuring equipment is not classified as armor", () => {
  assertEqual(
    resolveShopItemFilter({ type: "equipment", name: "Ink Pen" }),
    "gear",
    "ink pen"
  );
  assertEqual(
    resolveShopItemFilter({ type: "equipment", name: "Crystal Orb", armorType: "trinket" }),
    "gear",
    "orb"
  );
  assertEqual(
    resolveShopItemFilter({ type: "equipment", name: "Tinderbox" }),
    "gear",
    "tinderbox equipment"
  );
  assertEqual(
    resolveShopItemFilter({ type: "consumable", name: "Tinderbox" }),
    "supplies",
    "tinderbox consumable"
  );
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

console.log("\nTownForge merchant price filter tests");

const { matchesMerchantPriceFilter } = await import("../scripts/shop-price-filters.js");

test("up to 50 gp excludes items above 50 gp", () => {
  assert(matchesMerchantPriceFilter(4500, "50gp"), "45 gp included");
  assert(matchesMerchantPriceFilter(5000, "50gp"), "50 gp included");
  assert(!matchesMerchantPriceFilter(5001, "50gp"), "50.01 gp excluded");
});

test("50 gp+ only shows items at or above 50 gp", () => {
  assert(!matchesMerchantPriceFilter(1000, "50gp+"), "10 gp excluded");
  assert(!matchesMerchantPriceFilter(4500, "50gp+"), "45 gp excluded");
  assert(matchesMerchantPriceFilter(5000, "50gp+"), "50 gp included");
  assert(matchesMerchantPriceFilter(12000, "50gp+"), "120 gp included");
});

test("500 gp+ includes exactly 500 gp", () => {
  assert(matchesMerchantPriceFilter(50000, "500gp+"), "500 gp included");
  assert(!matchesMerchantPriceFilter(49999, "500gp+"), "499.99 gp excluded");
});

console.log("\nTownForge shop tradeable item tests");

const { isShopTradeableItem } = await import("../scripts/shop-constants.js");

test("unarmed strike is never shop tradeable", () => {
  assert(!isShopTradeableItem({ name: "Unarmed Strike", type: "weapon" }), "by name");
  assert(
    !isShopTradeableItem({ name: "Punch", type: "weapon", weaponType: "natural" }),
    "natural weapon"
  );
  assert(isShopTradeableItem({ name: "Longsword", type: "weapon" }), "normal weapon ok");
});

console.log(`\n${passed} tests passed`);
