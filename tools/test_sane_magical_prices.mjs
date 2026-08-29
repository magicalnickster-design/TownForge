/**
 * Sane Magical Prices lookup tests.
 * Run: node tools/test_sane_magical_prices.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "data/sane-magical-prices.json"), "utf8"));

/** Minimal in-test copy of lookup logic for node (no Foundry). */
function normalizeName(name) {
  return String(name ?? "")
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const index = new Map(
  Object.entries(data.items).map(([name, gp]) => [normalizeName(name), Number(gp)])
);

function lookupGP(name) {
  const key = normalizeName(name);
  if (index.has(key)) return index.get(key);
  const scroll = key.match(/spell scroll \((cantrip|level (\d+))\)/);
  if (scroll) {
    const level = scroll[1] === "cantrip" ? 0 : Number(scroll[2]);
    return index.get(`spell scroll level ${level}`) ?? null;
  }
  const plus = key.match(/^\+(\d)\s+(.+)$/);
  if (plus && /\barmor\b/.test(plus[2])) return index.get(`+${plus[1]} armor`) ?? null;
  if (plus && /\bshield\b/.test(plus[2])) return index.get(`+${plus[1]} shield`) ?? null;
  if (plus) return index.get(`+${plus[1]} weapon`) ?? null;
  return null;
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}\n expected: ${expected}\n actual:   ${actual}`);
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
test("+1 longsword uses +1 weapon price", () => {
  assertEqual(lookupGP("+1 Longsword"), 1000, "+1 weapon");
});

console.log(`\n${passed} tests passed`);
