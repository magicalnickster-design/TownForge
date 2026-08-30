/**
 * NPC combat stat tests.
 * Run: node tools/test_npc_combat_stats.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildNpcCombatStatUpdates, estimateNpcHp } from "../scripts/npc-combat-stats.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log("NPC combat stat tests");

test("estimateNpcHp scales with level", () => {
  assert(estimateNpcHp("fighter", 4, 12) === 44, "fighter 4");
  assert(estimateNpcHp("wizard", 5, 12) === 35, "wizard 5");
  assert(estimateNpcHp("commoner", 1, 10) === 4, "commoner 1");
});

test("buildNpcCombatStatUpdates uses class level", () => {
  const npc = JSON.parse(
    readFileSync(join(__dirname, "../data/npcs/government.json"), "utf8")
  ).npcs.find((row) => row.id === "bailiff-crowe");
  const updates = buildNpcCombatStatUpdates(npc);
  assert(updates["system.attributes.hp.max"] === 44, "bailiff hp");
  assert(updates["system.details.level"] === 4, "bailiff level");
});

console.log(`\n${passed} tests passed`);
