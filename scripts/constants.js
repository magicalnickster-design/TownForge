/**
 * Shared TownForge constants.
 * Future Free/Pro libraries, auth, and entitlements can key off these values.
 */

export const MODULE_ID = "townforge";
export const MODULE_TITLE = "TownForge";
export const LOG_PREFIX = "[TownForge]";

/** Local Free library id used by the data loader. */
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
 * Keep ids stable — NPC data files and future catalogs should use these keys.
 */
export const CATEGORIES = Object.freeze([
  { id: "all", label: "All" },
  { id: "tavern", label: "Tavern" },
  { id: "shops", label: "Shops" },
  { id: "guards", label: "Guards" },
  { id: "nobility", label: "Nobility" },
  { id: "commoners", label: "Commoners" },
  { id: "religious", label: "Religious" },
  { id: "criminal", label: "Criminal" },
  { id: "scholars", label: "Scholars" },
  { id: "travelers", label: "Travelers" },
  { id: "craftsmen", label: "Craftsmen" },
  { id: "government", label: "Government" },
  { id: "miscellaneous", label: "Miscellaneous" }
]);

/** Category file ids loaded for the Free library (excludes "all"). */
export const NPC_CATEGORY_FILES = Object.freeze(
  CATEGORIES.filter((category) => category.id !== "all").map((category) => category.id)
);

export const DATA_PATHS = Object.freeze({
  /** Manifest listing Free library category packs. */
  FREE_MANIFEST: `modules/${MODULE_ID}/data/npcs/manifest.json`,
  /** Category pack directory. */
  FREE_NPCS_DIR: `modules/${MODULE_ID}/data/npcs`
});

/** Required fields for a launch-library NPC entry. */
export const REQUIRED_NPC_FIELDS = Object.freeze([
  "id",
  "name",
  "occupation",
  "category",
  "biography",
  "portrait",
  "token",
  "actorData"
]);

export const FALLBACK_PORTRAIT = "icons/svg/mystery-man.svg";
export const FALLBACK_TOKEN = "icons/svg/mystery-man.svg";
