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
 * This service is intentionally library-aware so Free/Pro catalogs,
 * remote fetching, authentication, and entitlement checks can plug in later
 * without rewriting the browser UI.
 */
export class NpcService {
  /** @type {Map<string, object[]>} */
  #libraryCache = new Map();

  /** @type {Promise<void>|null} */
  #loadPromise = null;

  /**
   * Ensure local Free library data is loaded.
   * @returns {Promise<void>}
   */
  async ready() {
    if (!this.#loadPromise) {
      this.#loadPromise = this.#loadFreeLibrary();
    }
    await this.#loadPromise;
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

    // Future: authenticate with Gambits Forge and check Pro entitlement
    // before including LIBRARY_PRO.
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
    console.log(`${LOG_PREFIX} Loading Free NPC library from ${path}`);

    try {
      const response = await foundry.utils.fetchJsonWithTimeout(path);
      const entries = Array.isArray(response)
        ? response
        : Array.isArray(response?.npcs)
          ? response.npcs
          : [];

      const normalized = entries
        .map((entry) => this.#normalizeNpc(entry, LIBRARY_FREE))
        .filter(Boolean);

      this.#libraryCache.set(LIBRARY_FREE, normalized);
      console.log(`${LOG_PREFIX} Loaded ${normalized.length} Free NPCs`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to load Free NPC library`, error);
      this.#libraryCache.set(LIBRARY_FREE, []);
      ui.notifications?.error("TownForge could not load its NPC library.");
    }
  }

  /**
   * Normalize a raw NPC record into the shape the browser expects.
   * Extra fields are preserved for future Pro/import/AI pipelines.
   * @param {object} raw
   * @param {string} libraryId
   * @returns {object|null}
   */
  #normalizeNpc(raw, libraryId) {
    if (!raw?.id || !raw?.name) {
      console.warn(`${LOG_PREFIX} Skipping invalid NPC entry`, raw);
      return null;
    }

    return {
      id: String(raw.id),
      name: String(raw.name),
      race: String(raw.race ?? "Unknown"),
      occupation: String(raw.occupation ?? "Unknown"),
      category: String(raw.category ?? "commoners").toLowerCase(),
      description: String(raw.description ?? ""),
      portrait: String(raw.portrait ?? `modules/${MODULE_ID}/assets/portraits/placeholder.svg`),
      token: String(raw.token ?? raw.portrait ?? `modules/${MODULE_ID}/assets/tokens/placeholder.svg`),
      actorData: foundry.utils.deepClone(raw.actorData ?? {}),
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
