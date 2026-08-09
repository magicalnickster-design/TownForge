/**
 * Lightweight offline checks for TownForge shop helpers.
 * Run: node tools/test_shop_logic.mjs
 */

const COIN_CP = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };

function currencyToCopper(currency = {}) {
  return Object.entries(COIN_CP).reduce((sum, [denom, value]) => {
    return sum + (Number(currency[denom]) || 0) * value;
  }, 0);
}

function deductCopper(currency, priceCP) {
  let remaining = currencyToCopper(currency) - priceCP;
  if (remaining < 0) throw new Error("Insufficient funds");
  const next = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  for (const denom of ["pp", "gp", "ep", "sp", "cp"]) {
    const coinValue = COIN_CP[denom];
    next[denom] = Math.floor(remaining / coinValue);
    remaining -= next[denom] * coinValue;
  }
  return next;
}

function stableHash(text) {
  let hash = 2166136261;
  const str = String(text ?? "");
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function seededPick(list, count, seedText) {
  if (!list.length || count <= 0) return [];
  const arr = list.slice();
  let seed = Number.parseInt(stableHash(seedText).slice(0, 8), 16) || 1;
  const rand = () => {
    seed = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(count, arr.length));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Currency
assert(currencyToCopper({ gp: 10 }) === 1000, "10gp should be 1000cp");
assert(currencyToCopper({ pp: 1, sp: 2, cp: 3 }) === 1023, "mixed purse copper");
const paid = deductCopper({ gp: 5, sp: 10 }, 250); // 5gp + 10sp = 600cp, pay 2.5gp
assert(currencyToCopper(paid) === 350, "remaining after purchase");
assert(currencyToCopper(paid) >= 0, "no negative currency");

let failed = false;
try {
  deductCopper({ gp: 1 }, 200);
} catch {
  failed = true;
}
assert(failed, "insufficient funds should throw");

// Deterministic stock picks
const pool = Array.from({ length: 30 }, (_, i) => `item-${i}`);
const a = seededPick(pool, 8, "actor1:blacksmith:standard:3");
const b = seededPick(pool, 8, "actor1:blacksmith:standard:3");
const c = seededPick(pool, 8, "actor2:blacksmith:standard:3");
assert(JSON.stringify(a) === JSON.stringify(b), "same seed should match");
assert(JSON.stringify(a) !== JSON.stringify(c), "different actors should differ");

// Economy availability sketch
const tiers = {
  poor: { maxValueGP: 40, stockCount: 10 },
  standard: { maxValueGP: 200, stockCount: 16 },
  wealthy: { maxValueGP: 2000, stockCount: 22 }
};
assert(tiers.poor.maxValueGP < 1500, "poor should exclude plate (1500gp)");
assert(tiers.wealthy.maxValueGP >= 1500, "wealthy can include plate");

console.log("shop logic tests passed");
