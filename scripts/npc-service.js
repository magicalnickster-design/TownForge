import {
  CATEGORIES,
  DATA_PATHS,
  FALLBACK_PORTRAIT,
  FALLBACK_TOKEN,
  LIBRARY_FREE,
  LIBRARY_PRO,
  LOG_PREFIX,
  MODULE_ID,
  NPC_CATEGORY_FILES,
  REQUIRED_NPC_FIELDS
} from "./constants.js";

/** Loads and filters TownForge NPC packs from data/npcs. */
export class NpcService {
  /** @type {Map<string, object[]>} */
  #libraryCache = new Map();

  /** @type {Promise<void>|null} */
  #loadPromise = null;

  /** @type {boolean} */
  #loadFailed = false;

  /** @type {{total: number, valid: number, invalid: number, duplicateIds: string[], categories: Record<string, number>}} */
  #lastValidation = {
    total: 0,
    valid: 0,
    invalid: 0,
    duplicateIds: [],
    categories: {}
  };

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

  /** @returns {boolean} */
  get loadFailed() {
    return this.#loadFailed;
  }

  /** @returns {object} */
  get lastValidation() {
    return foundry.utils.deepClone(this.#lastValidation);
  }

  /** @returns {ReadonlyArray<{id: string, label: string}>} */
  getCategories() {
    return CATEGORIES;
  }

  /**
   * Resolve which libraries are currently available to this client.
   * @returns {string[]}
   */
  getAvailableLibraries() {
    const available = [LIBRARY_FREE];
    if (this.#isProLibraryEnabled()) {
      available.push(LIBRARY_PRO);
    }
    return available;
  }

  /**
   * @returns {Promise<object[]>}
   */
  async getAllNpcs() {
    await this.ready();
    const libraries = this.getAvailableLibraries();
    return libraries.flatMap((libraryId) => this.#libraryCache.get(libraryId) ?? []);
  }

  /**
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
        npc.species,
        npc.occupation,
        npc.category,
        npc.description,
        npc.gender,
        ...(npc.tags ?? [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }

  /**
   * Load Free library category packs listed by manifest.json.
   * @returns {Promise<void>}
   */
  async #loadFreeLibrary() {
    this.#loadFailed = false;
    const seenIds = new Set();
    const normalized = [];
    let invalid = 0;
    let total = 0;
    const categoryCounts = {};

    try {
      const packPaths = await this.#resolvePackPaths();
      if (!packPaths.length) {
        this.#loadFailed = true;
        this.#libraryCache.set(LIBRARY_FREE, []);
        this.#lastValidation = {
          total: 0,
          valid: 0,
          invalid: 0,
          duplicateIds: [],
          categories: {}
        };
        console.error(`${LOG_PREFIX} No NPC category packs found`);
        ui.notifications?.error("TownForge could not find its NPC library packs.");
        return;
      }

      for (const path of packPaths) {
        let response;
        try {
          response = await foundry.utils.fetchJsonWithTimeout(path);
        } catch (error) {
          console.error(`${LOG_PREFIX} Failed to load NPC pack ${path}`, error);
          invalid += 1;
          continue;
        }

        const { entries, malformed } = this.#extractEntries(response);
        if (malformed) {
          console.error(`${LOG_PREFIX} Malformed NPC pack at ${path}`, response);
          invalid += 1;
          continue;
        }

        for (const entry of entries) {
          total += 1;
          try {
            const npc = this.#normalizeNpc(entry, LIBRARY_FREE);
            if (!npc) {
              invalid += 1;
              continue;
            }

            if (seenIds.has(npc.id)) {
              invalid += 1;
              console.warn(`${LOG_PREFIX} Skipping duplicate NPC id "${npc.id}" from ${path}`);
              continue;
            }

            seenIds.add(npc.id);
            normalized.push(npc);
            categoryCounts[npc.category] = (categoryCounts[npc.category] ?? 0) + 1;
          } catch (error) {
            invalid += 1;
            const id = entry?.id ?? "unknown";
            console.error(`${LOG_PREFIX} Skipping NPC "${id}" due to normalize error`, error);
          }
        }
      }

      this.#libraryCache.set(LIBRARY_FREE, normalized);
      this.#lastValidation = {
        total,
        valid: normalized.length,
        invalid,
        duplicateIds: [],
        categories: categoryCounts
      };

      if (!normalized.length) {
        this.#loadFailed = true;
        ui.notifications?.error("TownForge could not load its NPC library.");
      }

      console.log(
        `${LOG_PREFIX} NPC library loaded (${normalized.length} NPCs` +
          `${invalid ? `, ${invalid} skipped` : ""})`
      );
    } catch (error) {
      this.#loadFailed = true;
      this.#libraryCache.set(LIBRARY_FREE, []);
      this.#lastValidation = {
        total,
        valid: 0,
        invalid: total || 1,
        duplicateIds: [],
        categories: {}
      };
      console.error(`${LOG_PREFIX} Failed to load NPC library`, error);
      ui.notifications?.error("TownForge could not load its NPC library.");
    }
  }

  /**
   * Resolve category pack paths from manifest.json, with a static fallback list.
   * @returns {Promise<string[]>}
   */
  async #resolvePackPaths() {
    try {
      const manifest = await foundry.utils.fetchJsonWithTimeout(DATA_PATHS.FREE_MANIFEST);
      if (Array.isArray(manifest?.packs) && manifest.packs.length) {
        return manifest.packs.map((pack) =>
          pack.startsWith("modules/")
            ? pack
            : `${DATA_PATHS.FREE_NPCS_DIR}/${pack.replace(/^\/+/, "")}`
        );
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} NPC manifest missing; falling back to category file list`, error);
    }

    return NPC_CATEGORY_FILES.map((id) => `${DATA_PATHS.FREE_NPCS_DIR}/${id}.json`);
  }

  /**
   * @param {unknown} response
   * @returns {{entries: object[], malformed: boolean}}
   */
  #extractEntries(response) {
    if (Array.isArray(response)) {
      return { entries: response, malformed: false };
    }

    if (response && typeof response === "object" && Array.isArray(response.npcs)) {
      return { entries: response.npcs, malformed: false };
    }

    return { entries: [], malformed: true };
  }

  /**
   * Validate and normalize one NPC record.
   * @param {object} raw
   * @param {string} libraryId
   * @returns {object|null}
   */
  #normalizeNpc(raw, libraryId) {
    if (!raw || typeof raw !== "object") {
      console.warn(`${LOG_PREFIX} Skipping invalid NPC entry (not an object)`, raw);
      return null;
    }

    const missing = REQUIRED_NPC_FIELDS.filter((field) => {
      const value = raw[field];
      if (field === "actorData") {
        return !value || typeof value !== "object" || Array.isArray(value);
      }
      return value === undefined || value === null || value === "";
    });

    if (missing.length) {
      const id = raw.id ?? "unknown";
      console.warn(
        `${LOG_PREFIX} Skipping NPC "${id}" — missing required fields: ${missing.join(", ")}`
      );
      return null;
    }

    const id = String(raw.id).trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      console.warn(`${LOG_PREFIX} Skipping NPC "${id}" — id must be kebab-case`);
      return null;
    }

    const category = String(raw.category).toLowerCase().trim();
    const knownCategories = new Set(NPC_CATEGORY_FILES);
    if (!knownCategories.has(category)) {
      console.warn(`${LOG_PREFIX} Skipping NPC "${id}" — unknown category "${category}"`);
      return null;
    }

    const expectedPortrait = `modules/${MODULE_ID}/assets/portraits/${id}.webp`;
    const expectedToken = `modules/${MODULE_ID}/assets/tokens/${id}.webp`;

    let actorData = {};
    try {
      actorData = foundry.utils.deepClone(raw.actorData);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Skipping NPC "${id}" — actorData could not be cloned`, error);
      return null;
    }

    if (!actorData.type) actorData.type = "npc";

    const species = String(raw.species ?? raw.race ?? "Human");
    const tags = Array.isArray(raw.tags)
      ? raw.tags.map((tag) => String(tag)).filter(Boolean)
      : [];

    return {
      id,
      name: String(raw.name).trim(),
      species,
      // Keep race as a compatibility alias for older UI/search code paths.
      race: species,
      gender: String(raw.gender ?? "Unknown"),
      age: Number.isFinite(Number(raw.age)) ? Number(raw.age) : String(raw.age ?? "Unknown"),
      occupation: String(raw.occupation).trim(),
      category,
      tags,
      description: String(raw.description ?? ""),
      biography: String(raw.biography).trim(),
      personality: String(raw.personality ?? ""),
      motivation: String(raw.motivation ?? ""),
      secret: String(raw.secret ?? ""),
      rumor: String(raw.rumor ?? ""),
      voice: String(raw.voice ?? ""),
      appearance: String(raw.appearance ?? ""),
      portrait: String(raw.portrait || expectedPortrait),
      token: String(raw.token || expectedToken),
      actorData,
      library: libraryId,
      relationships: Array.isArray(raw.relationships) ? raw.relationships : [],
      tokenVariants: Array.isArray(raw.tokenVariants) ? raw.tokenVariants : [],
      animatedToken: raw.animatedToken ?? null,
      fallbackPortrait: FALLBACK_PORTRAIT,
      fallbackToken: FALLBACK_TOKEN
    };
  }

  /** @returns {boolean} */
  #isProLibraryEnabled() {
    const proFlag = game.modules.get(MODULE_ID)?.flags?.townforge?.libraries?.pro;
    return Boolean(proFlag?.enabled);
  }
}

/** Shared singleton used by the module entrypoint and browser UI. */
export const npcService = new NpcService();
