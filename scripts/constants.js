/**
 * Shared TownForge constants.
 * Future Free/Pro libraries, auth, and entitlements can key off these values.
 */

export const MODULE_ID = "townforge";
export const MODULE_TITLE = "TownForge";
export const LOG_PREFIX = "[TownForge]";

/** Local Free library id used by the v0.1 data loader. */
export const LIBRARY_FREE = "free";

/** Reserved for future TownForge Pro content. */
export const LIBRARY_PRO = "pro";

/** Actor flag namespace helpers. */
export const FLAGS = Object.freeze({
  NPC_ID: "npcId",
  LIBRARY: "library",
  SOURCE: "source"
});

/**
 * Browser category filters.
 * Keep ids stable — NPC data and future remote catalogs should use these keys.
 */
export const CATEGORIES = Object.freeze([
  { id: "all", label: "All" },
  { id: "tavern", label: "Tavern" },
  { id: "shops", label: "Shops" },
  { id: "guards", label: "Guards" },
  { id: "nobility", label: "Nobility" },
  { id: "commoners", label: "Commoners" }
]);

export const DATA_PATHS = Object.freeze({
  /** v0.1 Free library NPC catalog. */
  FREE_NPCS: `modules/${MODULE_ID}/data/npcs.json`
});
