/**
 * Compendium resolver unit tests.
 * Run: node tools/test_compendium_resolver.mjs
 */

import {
  collapseCompendiumSlug,
  inferDocumentNameFromPackId,
  matchesCompendiumIndexEntry,
  parseCompendiumUuid,
  toCompendiumSlug
} from "../scripts/compendium-resolver.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("compendium-resolver tests");

test("slugifies compendium names", () => {
  assert(toCompendiumSlug("Calligrapher's Supplies") === "calligrapher-s-supplies");
  assert(toCompendiumSlug("Studded Leather") === "studded-leather");
  assert(collapseCompendiumSlug("calligrapher-s-supplies") === "calligrapherssupplies");
  assert(collapseCompendiumSlug("calligraphers-supplies") === "calligrapherssupplies");
});

test("parses compendium UUIDs", () => {
  const parsed = parseCompendiumUuid("Compendium.dnd5e.items.rapier");
  assert(parsed?.packId === "dnd5e.items", "pack id");
  assert(parsed?.docId === "rapier", "doc id");
  assert(parsed?.slug === "rapier", "slug");
});

test("infers document names from pack ids", () => {
  assert(inferDocumentNameFromPackId("dnd5e.spells24") === "Spell");
  assert(inferDocumentNameFromPackId("dnd5e.equipment24") === "Item");
});

test("matches index rows by slug or name", () => {
  const row = { _id: "abc123", name: "Calligrapher's Supplies" };
  assert(matchesCompendiumIndexEntry(row, { slug: "calligraphers-supplies" }));
  assert(matchesCompendiumIndexEntry(row, { slug: "calligrapher-s-supplies" }));
  assert(matchesCompendiumIndexEntry(row, { name: "Calligrapher's Supplies" }));
  assert(!matchesCompendiumIndexEntry(row, { slug: "rapier" }));
});

console.log(`\nOK: ${passed} compendium resolver tests passed`);
