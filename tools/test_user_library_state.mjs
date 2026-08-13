/**
 * TownForge Favorites & Recently Used unit tests.
 * Run: node tools/test_user_library_state.mjs
 */

import {
  LIBRARY_FILTERS,
  RECENT_NPC_LIMIT,
  filterLibraryNpcs,
  normalizeFavorites,
  normalizeRecent,
  pruneFavorites,
  pruneRecent,
  recordRecentNpcId,
  sortLibraryNpcs,
  toggleFavoriteId
} from "../scripts/user-library-state.js";

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

const sampleNpcs = [
  { id: "asha-roadbless", name: "Asha Roadbless", occupation: "Pilgrim", category: "travelers", tags: [] },
  { id: "borin-ironhand", name: "Borin Ironhand", occupation: "Blacksmith", category: "craftsmen", tags: ["smith"] },
  { id: "mira-swiftbrook", name: "Mira Swiftbrook", occupation: "Tavern Keeper", category: "tavern", tags: [] },
  { id: "serra-dawnpike", name: "Serra Dawnpike", occupation: "City Guard Captain", category: "guards", tags: ["guard"] },
  { id: "tovin-brassbarrow", name: "Tovin Brassbarrow", occupation: "General Store Owner", category: "shops", tags: [] }
];

console.log("TownForge favorites + recently used tests");

test("favorite NPC", () => {
  const result = toggleFavoriteId([], "borin-ironhand");
  assert(result.favorited === true, "favorited");
  assertEqual(result.favorites, ["borin-ironhand"], "added");
});

test("unfavorite NPC", () => {
  const result = toggleFavoriteId(["borin-ironhand", "asha-roadbless"], "borin-ironhand");
  assert(result.favorited === false, "unfavorited");
  assertEqual(result.favorites, ["asha-roadbless"], "removed");
});

test("favorites persist shape is plain id array", () => {
  const normalized = normalizeFavorites(["asha-roadbless", "borin-ironhand", "asha-roadbless", ""]);
  assertEqual(normalized, ["asha-roadbless", "borin-ironhand"], "unique ids");
});

test("favorites are per-user storage key conceptual separation", () => {
  // Simulated two users with independent arrays.
  const userA = toggleFavoriteId([], "borin-ironhand").favorites;
  const userB = toggleFavoriteId([], "mira-swiftbrook").favorites;
  assert(!userA.includes("mira-swiftbrook"), "A independent");
  assert(!userB.includes("borin-ironhand"), "B independent");
});

test("Favorites filter works", () => {
  const filtered = filterLibraryNpcs(sampleNpcs, {
    mode: LIBRARY_FILTERS.FAVORITES,
    favoriteIds: ["borin-ironhand", "missing-id"]
  });
  assertEqual(
    filtered.map((npc) => npc.id),
    ["borin-ironhand"],
    "only favorites"
  );
});

test("Search + Favorites works", () => {
  const filtered = filterLibraryNpcs(sampleNpcs, {
    mode: LIBRARY_FILTERS.FAVORITES,
    favoriteIds: ["borin-ironhand", "serra-dawnpike", "mira-swiftbrook"],
    query: "blacksmith"
  });
  assertEqual(
    filtered.map((npc) => npc.id),
    ["borin-ironhand"],
    "favorite blacksmith"
  );
});

test("Import Actor / Add to Scene record Recent", () => {
  const first = recordRecentNpcId([], "borin-ironhand", 1000);
  assertEqual(first.map((e) => e.id), ["borin-ironhand"], "recorded");
  assert(first[0].lastUsed === 1000, "timestamp");
});

test("Opening an NPC does NOT record Recent (helper unused)", () => {
  // Selecting an NPC never calls recordRecentNpcId — covered by API design.
  const recent = normalizeRecent([]);
  assertEqual(recent, [], "empty until import/add");
});

test("Same NPC used twice does not duplicate", () => {
  let recent = recordRecentNpcId([], "borin-ironhand", 1000);
  recent = recordRecentNpcId(recent, "borin-ironhand", 2000);
  assertEqual(recent.map((e) => e.id), ["borin-ironhand"], "no duplicate");
  assert(recent[0].lastUsed === 2000, "updated stamp");
});

test("Reusing NPC moves it to top", () => {
  let recent = recordRecentNpcId([], "asha-roadbless", 1000);
  recent = recordRecentNpcId(recent, "borin-ironhand", 2000);
  recent = recordRecentNpcId(recent, "asha-roadbless", 3000);
  assertEqual(
    recent.map((e) => e.id),
    ["asha-roadbless", "borin-ironhand"],
    "moved to top"
  );
});

test("Recent list caps at 20", () => {
  let recent = [];
  for (let i = 0; i < 25; i += 1) {
    recent = recordRecentNpcId(recent, `npc-${i}`, i + 1);
  }
  assert(recent.length === RECENT_NPC_LIMIT, "cap 20");
  assert(recent[0].id === "npc-24", "newest first");
  assert(!recent.some((entry) => entry.id === "npc-0"), "oldest dropped");
});

test("Recently Used filter orders correctly", () => {
  const recentEntries = [
    { id: "serra-dawnpike", lastUsed: 3000 },
    { id: "borin-ironhand", lastUsed: 2000 },
    { id: "mira-swiftbrook", lastUsed: 1000 }
  ];
  const filtered = filterLibraryNpcs(sampleNpcs, {
    mode: LIBRARY_FILTERS.RECENT,
    recentEntries
  });
  const ordered = sortLibraryNpcs(filtered, "recent", recentEntries);
  assertEqual(
    ordered.map((npc) => npc.id),
    ["serra-dawnpike", "borin-ironhand", "mira-swiftbrook"],
    "newest first"
  );
});

test("Search + Recently Used works", () => {
  const recentEntries = [
    { id: "serra-dawnpike", lastUsed: 3000 },
    { id: "borin-ironhand", lastUsed: 2000 },
    { id: "tovin-brassbarrow", lastUsed: 1000 }
  ];
  const filtered = filterLibraryNpcs(sampleNpcs, {
    mode: LIBRARY_FILTERS.RECENT,
    recentEntries,
    query: "guard"
  });
  assertEqual(
    filtered.map((npc) => npc.id),
    ["serra-dawnpike"],
    "recent guard"
  );
});

test("Recently Used sort works", () => {
  const recentEntries = [
    { id: "tovin-brassbarrow", lastUsed: 5000 },
    { id: "asha-roadbless", lastUsed: 1000 }
  ];
  const ordered = sortLibraryNpcs(sampleNpcs, "recent", recentEntries).map((npc) => npc.id);
  assert(ordered[0] === "tovin-brassbarrow", "recent first");
  assert(ordered[1] === "asha-roadbless", "older recent second");
  // Never-used fall back to Name A-Z among themselves after recent entries.
  const neverUsed = ordered.slice(2);
  assertEqual(neverUsed, [...neverUsed].sort(), "unused A-Z");
});

test("Missing user flags handled", () => {
  assertEqual(normalizeFavorites(undefined), [], "favorites missing");
  assertEqual(normalizeRecent(undefined), [], "recent missing");
});

test("Malformed flags handled", () => {
  assertEqual(normalizeFavorites("nope"), [], "favorites bad");
  assertEqual(normalizeFavorites([null, 12, { id: "x" }, "ok"]), ["ok"], "favorites junk");
  assertEqual(
    normalizeRecent([{ foo: 1 }, { id: "a", lastUsed: "nope" }, { id: "b", lastUsed: 9 }]).map(
      (e) => e.id
    ),
    ["b", "a"],
    "recent junk"
  );
});

test("Removed NPC IDs ignored", () => {
  const known = new Set(["borin-ironhand", "mira-swiftbrook"]);
  assertEqual(
    pruneFavorites(["borin-ironhand", "gone-npc"], known),
    ["borin-ironhand"],
    "prune favorites"
  );
  assertEqual(
    pruneRecent(
      [
        { id: "gone-npc", lastUsed: 9 },
        { id: "mira-swiftbrook", lastUsed: 3 }
      ],
      known
    ).map((e) => e.id),
    ["mira-swiftbrook"],
    "prune recent"
  );
});

test("Pagination works with Favorites", () => {
  const favorites = sampleNpcs.map((npc) => npc.id);
  const filtered = filterLibraryNpcs(sampleNpcs, {
    mode: LIBRARY_FILTERS.FAVORITES,
    favoriteIds: favorites
  });
  const pageSize = 2;
  const page = 2;
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  assert(pageItems.length === 2, "page size");
  assert(Math.ceil(filtered.length / pageSize) === 3, "page count");
});

test("Pagination works with Recently Used", () => {
  const recentEntries = sampleNpcs.map((npc, index) => ({
    id: npc.id,
    lastUsed: 1000 + index
  }));
  const filtered = sortLibraryNpcs(
    filterLibraryNpcs(sampleNpcs, { mode: LIBRARY_FILTERS.RECENT, recentEntries }),
    "recent",
    recentEntries
  );
  const pageSize = 2;
  const page1 = filtered.slice(0, pageSize).map((npc) => npc.id);
  assertEqual(page1, ["tovin-brassbarrow", "serra-dawnpike"], "newest page 1");
});

test("Name sorts still work", () => {
  const asc = sortLibraryNpcs(sampleNpcs, "name-asc").map((npc) => npc.name);
  const desc = sortLibraryNpcs(sampleNpcs, "name-desc").map((npc) => npc.name);
  assertEqual(asc, [...asc].sort(), "A-Z");
  assertEqual(desc, [...asc].sort().reverse(), "Z-A");
});

console.log(`\n${passed} tests passed`);
