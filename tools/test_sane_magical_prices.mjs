/**
 * Sane Magical Prices lookup tests.
 * Run: node tools/test_sane_magical_prices.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildSaneMagicalPriceIndex,
  inferSpellScrollLevel,
  lookupSaneMagicalPriceGP
} from "../scripts/sane-magical-prices.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "data/sane-magical-prices.json"), "utf8"));
const index = buildSaneMagicalPriceIndex(data.items);

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}\n expected: ${expected}\n actual:   ${actual}`);
}

function lookupGP(name, item = null) {
  return lookupSaneMagicalPriceGP(name, item, index);
}

console.log("TownForge Sane Magical Prices tests");
test("catalog has hundreds of entries", () => {
  if (Object.keys(data.items).length < 250) throw new Error("too few items");
});
test("sentinel shield uses sane price", () => {
  assertEqual(lookupGP("Sentinel Shield"), 20000, "sentinel shield");
});
test("sovereign glue uses sane price", () => {
  assertEqual(lookupGP("Sovereign Glue"), 400, "sovereign glue");
});
test("spell scroll cantrip maps to level 0", () => {
  assertEqual(lookupGP("Spell Scroll (Cantrip)"), 10, "cantrip scroll");
});
test("spell scroll level 1", () => {
  assertEqual(lookupGP("Spell Scroll (Level 1)"), 60, "level 1 scroll");
});
test("spell scroll colon format uses item level", () => {
  assertEqual(
    lookupGP("Spell Scroll: Fireball", { system: { level: 3 } }),
    200,
    "spell scroll colon"
  );
});
test("inferSpellScrollLevel reads stock spellLevel", () => {
  assertEqual(inferSpellScrollLevel("Spell Scroll: Bless", { spellLevel: 1 }), 1, "stock level");
});
test("+1 longsword uses +1 weapon price", () => {
  assertEqual(lookupGP("+1 Longsword"), 1000, "+1 weapon");
});
test("tome of the stilled tongue is not in SMP", () => {
  assertEqual(lookupGP("Tome of the Stilled Tongue"), null, "unknown tome");
});

console.log(`\n${passed} tests passed`);
