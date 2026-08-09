import {
  CATEGORIES,
  DATA_PATHS,
  LIBRARY_FREE,
  LIBRARY_PRO,
  LOG_PREFIX,
  MODULE_ID
} from "./constants.js";

/**
 * NPC data access layer.
 *
 * v0.1 loads a local Free library catalog from data/npcs.json.
 * Library-aware so Free/Pro catalogs can plug in later.
 */
export class NpcService {
  /** @type {Map<string, object[]>} */
  #libraryCache = new Map();

  /** @type {Promise<void>|null} */
  #loadPromise = null;

  /** @type {boolean} */
  #loadFailed = false;

  /**
   * Ensure local Free library data is loaded.
   * Failed loads are cached as empty so Foundry does not crash; reopen/reload to retry.
   * @returns {Promise<void>}
   */
  async ready() {
    if (!this.#loadPromise) {
      this.#loadPromise = this.#loadFreeLibrary();
    }
    await this.#loadPromise;
  }

  /**
   * Whether the last Free library load failed.
   * @returns {boolean}
   */
  get loadFailed() {
    return this.#loadFailed;
  }

  /**
   * Return category filter definitions for the browser UI.
   * @returns {ReadonlyArray<{id: string, label: string}>}
   */
  getCategories() {
    return CATEGORIES;
  }

  /**
   * Resolve which libraries are currently available to this client.
   * Pro / entitlement gating will live here later.
   * @returns {string[]}
   */
  getAvailableLibraries() {
    const available = [LIBRARY_FREE];

    // Future: Gambits Forge auth + Pro entitlement check before including Pro.
    if (this.#isProLibraryEnabled()) {
      available.push(LIBRARY_PRO);
    }

    return available;
  }

  /**
   * Get every NPC from every currently available library.
   * @returns {Promise<object[]>}
   */
  async getAllNpcs() {
    await this.ready();
    const libraries = this.getAvailableLibraries();
    return libraries.flatMap((libraryId) => this.#libraryCache.get(libraryId) ?? []);
  }

  /**
   * Find a single NPC by stable id across available libraries.
   * @param {string} npcId
   * @returns {Promise<object|null>}
   */
  async getNpcById(npcId) {
    if (!npcId) return null;
    const npcs = await this.getAllNpcs();
    return npcs.find((npc) => npc.id === npcId) ?? null;
  }

  /**
   * Filter NPCs by category and free-text search.
   * @param {{ category?: string, query?: string }} [options]
   * @returns {Promise<object[]>}
   */
  async searchNpcs({ category = "all", query = "" } = {}) {
    const npcs = await this.getAllNpcs();
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedCategory = category || "all";

    return npcs.filter((npc) => {
      const categoryMatch =
        normalizedCategory === "all" || npc.category === normalizedCategory;

      if (!categoryMatch) return false;
      if (!normalizedQuery) return true;

      const haystack = [
        npc.name,
        npc.race,
        npc.occupation,
        npc.category,
        npc.description
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }

  /**
   * Load and normalize the local Free library catalog.
   * @returns {Promise<void>}
   */
  async #loadFreeLibrary() {
    const path = DATA_PATHS.FREE_NPCS;
    this.#loadFailed = false;

    try {
      const response = await foundry.utils.fetchJsonWithTimeout(path);
      const { entries, malformed } = this.#extractEntries(response);

      if (malformed) {
        this.#loadFailed = true;
        this.#libraryCache.set(LIBRARY_FREE, []);
        console.error(`${LOG_PREFIX} Malformed NPC library JSON at ${path}`, response);
        ui.notifications?.error("TownForge NPC library JSON is malformed.");
        return;
      }

      const normalized = [];
      for (const entry of entries) {
        try {
          const npc = this.#normalizeNpc(entry, LIBRARY_FREE);
          if (npc) normalized.push(npc);
        } catch (error) {
          console.error(`${LOG_PREFIX} Skipping NPC entry due to normalize error`, entry, error);
        }
      }

      this.#libraryCache.set(LIBRARY_FREE, normalized);
      console.log(`${LOG_PREFIX} NPC library loaded (${normalized.length} NPCs)`);
    } catch (error) {
      this.#loadFailed = true;
      this.#libraryCache.set(LIBRARY_FREE, []);
      console.error(`${LOG_PREFIX} Failed to load NPC library from ${path}`, error);
      ui.notifications?.error("TownForge could not load its NPC library.");
    }
  }

  /**
   * Accept either a raw array or `{ npcs: [] }` catalog shape.
   * @param {unknown} response
   * @param {string} path
   * @returns {{entries: object[], malformed: boolean}}
   */
  #extractEntries(response, path) {
    if (Array.isArray(response)) {
      return { entries: response, malformed: false };
    }

    if (response && typeof response === "object" && Array.isArray(response.npcs)) {
      return { entries: response.npcs, malformed: false };
    }

    return { entries: [], malformed: true };
  }

  /**
   * Normalize a raw NPC record into the shape the browser expects.
   * @param {object} raw
   * @param {string} libraryId
   * @returns {object|null}
   */
  #normalizeNpc(raw, libraryId) {
    if (!raw || typeof raw !== "object") {
      console.warn(`${LOG_PREFIX} Skipping invalid NPC entry (not an object)`, raw);
      return null;
    }

    if (!raw.id || !raw.name) {
      console.warn(`${LOG_PREFIX} Skipping invalid NPC entry (missing id/name)`, raw);
      return null;
    }

    const placeholderPortrait = `modules/${MODULE_ID}/assets/portraits/placeholder.svg`;
    const placeholderToken = `modules/${MODULE_ID}/assets/tokens/placeholder.svg`;

    let actorData = {};
    try {
      actorData = foundry.utils.deepClone(raw.actorData ?? {});
    } catch (error) {
      console.warn(`${LOG_PREFIX} Invalid actorData for NPC "${raw.id}"; using empty object`, error);
      actorData = {};
    }

    return {
      id: String(raw.id),
      name: String(raw.name),
      race: String(raw.race ?? "Unknown"),
      occupation: String(raw.occupation ?? "Unknown"),
      category: String(raw.category ?? "commoners").toLowerCase(),
      description: String(raw.description ?? ""),
      portrait: String(raw.portrait || placeholderPortrait),
      token: String(raw.token || raw.portrait || placeholderToken),
      actorData,
      library: libraryId,
      // Reserved for future animated WebM / multi-variant support.
      tokenVariants: Array.isArray(raw.tokenVariants) ? raw.tokenVariants : [],
      animatedToken: raw.animatedToken ?? null,
      tags: Array.isArray(raw.tags) ? raw.tags : []
    };
  }

  /**
   * Placeholder Pro entitlement check.
   * @returns {boolean}
   */
  #isProLibraryEnabled() {
    const proFlag = game.modules.get(MODULE_ID)?.flags?.townforge?.libraries?.pro;
    return Boolean(proFlag?.enabled);
  }
}

/** Shared singleton used by the module entrypoint and browser UI. */
export const npcService = new NpcService();
