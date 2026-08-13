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
  SOURCE: "source",
  OCCUPATION: "occupation"
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

/** @deprecated Prefer per-user flags.townforge.favorites; kept for one-time migration. */
export const FAVORITES_KEY = "townforge.favorites";

/** Max recently-used NPC entries stored per user. */
export const RECENT_NPC_LIMIT = 20;
export const PRIMARY_CATEGORY_IDS = Object.freeze([
  "all",
  "tavern",
  "shops",
  "guards",
  "nobility",
  "religious",
  "criminal"
]);

/** Soft encounter labels shown as "Commonly Found" in the detail pane. */
export const CATEGORY_LOCATIONS = Object.freeze({
  tavern: "Local Tavern",
  shops: "Market District",
  guards: "Town Watch",
  nobility: "Upper District",
  commoners: "Town Streets",
  religious: "Local Temple",
  criminal: "Back Alleys",
  scholars: "Archives & Studies",
  travelers: "Roadside & Gates",
  craftsmen: "Craft District",
  government: "Civic Offices",
  miscellaneous: "Town Commons"
});

/** Occupation-specific encounter labels (preferred over category defaults). */
export const OCCUPATION_LOCATIONS = Object.freeze({
  "Tavern Keeper": "Local Tavern",
  "Cellar Master": "Local Tavern",
  "Barmaid": "Local Tavern",
  "Bouncer": "Local Tavern",
  "Fireplace Regular": "Local Tavern",
  "Wine Seller": "Local Tavern",
  "Taproom Cook": "Local Tavern",
  "Evening Singer": "Local Tavern",
  "Dice Dealer": "Local Tavern",
  "General Store Owner": "Market District",
  "Shop Clerk": "Market District",
  "Moneylender": "Market District",
  "Clothier": "Market District",
  "Spice Merchant": "Market District",
  "Bookstore Owner": "Market District",
  "Grain Dealer": "Market District",
  "Haberdasher": "Market District",
  "Chandler": "Craft District",
  "Apothecary Clerk": "Market District",
  "Pawnbroker": "Market District",
  "City Guard Captain": "Town Watch",
  "Junior Guard": "Town Watch",
  "Gate Sergeant": "Town Watch",
  "Wall Archer": "Town Watch",
  "Watch Investigator": "Town Watch",
  "Riot Shield Guard": "Town Watch",
  "Night Patrol Lead": "Town Watch",
  "Armory Warden": "Town Watch",
  "Undercover Watcher": "Town Watch",
  "Drill Instructor": "Town Watch",
  "Noble Patron": "Upper District",
  "Estate Hostess": "Upper District",
  "Knight Retainer": "Upper District",
  "Court Gossip": "Upper District",
  "Mining Magnate": "Upper District",
  "Lady-in-Waiting": "Upper District",
  "Heir Apparent": "Upper District",
  "Salon Patron": "Upper District",
  "Street Sweep": "Town Streets",
  "Carter": "Town Streets",
  "Laundry Worker": "Town Streets",
  "Messenger Boy": "Town Streets",
  "Well Keeper": "Town Streets",
  "Stable Hand": "Stables",
  "Chimney Sweep": "Town Streets",
  "Street Peddler": "Market District",
  "Dock Hauler": "Docks",
  "Seamstress": "Craft District",
  "Baker's Assistant": "Market District",
  "Herb Gatherer": "Roadside & Gates",
  "Temple Priestess": "Local Temple",
  "Temple Archivist": "Local Temple",
  "Alms Keeper": "Local Temple",
  "Funeral Priest": "Local Temple",
  "Acolyte": "Local Temple",
  "Oracle": "Local Temple",
  "Cloister Monk": "Local Temple",
  "Guard Chaplain": "Town Watch",
  "Fence": "Back Alleys",
  "Pickpocket": "Back Alleys",
  "Lookout": "Back Alleys",
  "Smuggler": "Docks",
  "Forgery Clerk": "Back Alleys",
  "Information Broker": "Back Alleys",
  "Debt Collector": "Back Alleys",
  "Sewer Runner": "Back Alleys",
  "Town Mage": "Archives & Studies",
  "Public Scribe": "Civic Offices",
  "Library Archivist": "Archives & Studies",
  "Alchemist": "Archives & Studies",
  "Children's Tutor": "Archives & Studies",
  "Cartographer": "Archives & Studies",
  "Town Historian": "Archives & Studies",
  "Caravan Master": "Roadside & Gates",
  "Wilderness Scout": "Roadside & Gates",
  "Traveling Minstrel": "Roadside & Gates",
  "Pilgrim": "Roadside Shrines",
  "River Sailor": "Docks",
  "Game Hunter": "Roadside & Gates",
  "Long-Road Courier": "Roadside & Gates",
  "Blacksmith": "Smithy District",
  "Cooper": "Craft District",
  "Potter": "Craft District",
  "Carpenter": "Craft District",
  "Cobbler": "Craft District",
  "Fletcher": "Craft District",
  "Baker": "Market District",
  "Tinker": "Craft District",
  "Weaver": "Craft District",
  "Stonemason": "Craft District",
  "Town Mayor": "Civic Offices",
  "Town Clerk": "Civic Offices",
  "Bailiff": "Civic Offices",
  "Tax Assessor": "Civic Offices",
  "Magistrate": "Civic Offices",
  "Town Herald": "Civic Offices",
  "Midwife": "Town Streets",
  "Gravedigger": "Town Commons",
  "Ratcatcher": "Back Alleys",
  "Matchmaker": "Town Streets"
});

/** Category accent colors for tags/cards. */
export const CATEGORY_COLORS = Object.freeze({
  tavern: "#d0894a",
  shops: "#c4a35a",
  guards: "#5b8fd9",
  nobility: "#c9b27a",
  commoners: "#8f9aa3",
  religious: "#8f7cc7",
  criminal: "#c45b5b",
  scholars: "#9a6fd1",
  travelers: "#5fa8a0",
  craftsmen: "#b07d4a",
  government: "#6e8bb5",
  miscellaneous: "#7f8c8d"
});

export const BROWSER_PAGE_SIZE = 9;
