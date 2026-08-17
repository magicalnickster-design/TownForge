import { actorService } from "./actor-service.js";
import {
  BROWSER_PAGE_SIZE,
  CATEGORY_COLORS,
  CATEGORY_LOCATIONS,
  FAVORITES_KEY,
  LOG_PREFIX,
  MODULE_ID,
  MODULE_TITLE,
  OCCUPATION_LOCATIONS,
  PRIMARY_CATEGORY_IDS
} from "./constants.js";
import { npcService } from "./npc-service.js";
import {
  LIBRARY_FILTERS,
  filterLibraryNpcs,
  loadUserFavorites,
  loadUserRecent,
  pruneFavorites,
  pruneRecent,
  recordUserRecentNpc,
  saveUserFavorites,
  saveUserRecent,
  sortLibraryNpcs,
  toggleUserFavorite
} from "./user-library-state.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** NPC library browser. */
export class NpcBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {string} */
  #query = "";

  /** @type {string} */
  #category = "all";

  /** @type {string|null} */
  #selectedNpcId = null;

  /** @type {number} */
  #page = 1;

  /** @type {"name-asc"|"name-desc"|"recent"|"occupation"|"category"} */
  #sort = "name-asc";

  /** @type {"bio"|"personality"|"motivation"|"secret"|"stats"|"inventory"} */
  #detailTab = "bio";

  /** @type {boolean} */
  #moreOpen = false;

  /** @type {Set<string>} */
  #favorites = new Set();

  /** @type {{id:string,lastUsed:number}[]} */
  #recent = [];

  /** @type {boolean} */
  #stateLoaded = false;

  static DEFAULT_OPTIONS = {
    id: "townforge-npc-browser",
    classes: ["townforge", "townforge-npc-browser"],
    tag: "div",
    window: {
      title: `${MODULE_TITLE} NPC Library`,
      resizable: true,
      contentClasses: ["townforge-window-content"]
    },
    position: {
      width: 1280,
      height: 860
    },
    actions: {
      setCategory: this.#onSetCategory,
      toggleMore: this.#onToggleMore,
      selectNpc: this.#onSelectNpc,
      setPage: this.#onSetPage,
      setDetailTab: this.#onSetDetailTab,
      toggleFavorite: this.#onToggleFavorite,
      importActor: this.#onImportActor,
      addToScene: this.#onAddToScene
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/npc-browser.hbs`,
      templates: [
        `modules/${MODULE_ID}/templates/npc-content.hbs`,
        `modules/${MODULE_ID}/templates/npc-details.hbs`
      ],
      scrollable: [".townforge-library-scroll", ".townforge-detail-scroll"]
    }
  };

  /**
   * @returns {Promise<NpcBrowser>}
   */
  static async show() {
    const existing = foundry.applications.instances.get("townforge-npc-browser");
    if (existing instanceof NpcBrowser) {
      console.log(`${LOG_PREFIX} Browser opened`);
      await existing.render({ force: true });
      existing.bringToFront?.();
      return existing;
    }

    const app = new NpcBrowser();
    console.log(`${LOG_PREFIX} Browser opened`);
    await app.render({ force: true });
    return app;
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    await npcService.ready();
    await this.#ensureUserState(npcService);

    const allNpcs = await npcService.getAllNpcs();
    const mode = this.#resolveFilterMode();
    let npcs = filterLibraryNpcs(allNpcs, {
      mode,
      query: this.#query,
      favoriteIds: [...this.#favorites],
      recentEntries: this.#recent,
      category: this.#category
    });

    // Recently Used filter always shows newest → oldest regardless of sort dropdown,
    // unless the user explicitly chose another sort.
    const sortForView =
      mode === LIBRARY_FILTERS.RECENT && this.#sort === "name-asc" ? "recent" : this.#sort;
    npcs = sortLibraryNpcs(npcs, sortForView, this.#recent);

    const totalCount = npcs.length;
    const pageCount =
      totalCount > 0 ? Math.max(1, Math.ceil(totalCount / BROWSER_PAGE_SIZE)) : 0;
    if (pageCount > 0 && this.#page > pageCount) this.#page = pageCount;
    if (this.#page < 1) this.#page = 1;

    const start = (this.#page - 1) * BROWSER_PAGE_SIZE;
    const pageNpcs = npcs.slice(start, start + BROWSER_PAGE_SIZE).map((npc) =>
      this.#decorateNpc(npc, { selected: npc.id === this.#selectedNpcId })
    );

    let selectedNpc = this.#selectedNpcId
      ? await npcService.getNpcById(this.#selectedNpcId)
      : null;

    if (this.#selectedNpcId && !selectedNpc) {
      this.#selectedNpcId = null;
    }

    if (!selectedNpc && pageNpcs.length) {
      this.#selectedNpcId = pageNpcs[0].id;
      selectedNpc = await npcService.getNpcById(this.#selectedNpcId);
      pageNpcs[0].selected = true;
    }

    const allCategories = npcService.getCategories();
    const primaryCategories = allCategories
      .filter((category) => PRIMARY_CATEGORY_IDS.includes(category.id))
      .map((category) => ({
        ...category,
        active: category.id === this.#category
      }));

    const moreCategories = [
      {
        id: LIBRARY_FILTERS.FAVORITES,
        label: "Favorites",
        active: this.#category === LIBRARY_FILTERS.FAVORITES
      },
      {
        id: LIBRARY_FILTERS.RECENT,
        label: "Recently Used",
        active: this.#category === LIBRARY_FILTERS.RECENT
      },
      ...allCategories
        .filter((category) => category.id !== "all" && !PRIMARY_CATEGORY_IDS.includes(category.id))
        .map((category) => ({
          ...category,
          active: category.id === this.#category
        }))
    ];

    const moreActive = moreCategories.some((category) => category.active);
    const emptyState = this.#emptyState(totalCount);

    return Object.assign(context, {
      title: MODULE_TITLE,
      query: this.#query,
      category: this.#category,
      primaryCategories,
      moreCategories,
      moreOpen: this.#moreOpen,
      moreActive,
      npcs: pageNpcs,
      selectedNpc: selectedNpc ? this.#decorateNpc(selectedNpc, { detail: true }) : null,
      resultCount: totalCount,
      page: this.#page,
      pageCount,
      pages: this.#buildPages(this.#page, pageCount),
      prevPage: Math.max(1, this.#page - 1),
      nextPage: Math.min(pageCount, this.#page + 1),
      isFirstPage: this.#page <= 1,
      isLastPage: this.#page >= pageCount,
      sortAsc: this.#sort === "name-asc",
      sortDesc: this.#sort === "name-desc",
      sortRecent: this.#sort === "recent",
      sortOccupation: this.#sort === "occupation",
      sortCategory: this.#sort === "category",
      detailTab: this.#detailTab,
      loadFailed: npcService.loadFailed,
      emptyState
    });
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#bindSearchInput();
    this.#bindSortSelect();
    this.#bindImageFallbacks();
  }

  #resolveFilterMode() {
    if (this.#category === LIBRARY_FILTERS.FAVORITES) return LIBRARY_FILTERS.FAVORITES;
    if (this.#category === LIBRARY_FILTERS.RECENT) return LIBRARY_FILTERS.RECENT;
    if (!this.#category || this.#category === "all") return "all";
    return "category";
  }

  #emptyState(totalCount) {
    if (totalCount > 0) return null;
    if (npcService.loadFailed) {
      return {
        title: "Library Unavailable",
        body: "TownForge could not load its NPC library."
      };
    }
    if (this.#category === LIBRARY_FILTERS.FAVORITES) {
      return {
        title: "No Favorites Yet",
        body: "Click the star on an NPC to add them here."
      };
    }
    if (this.#category === LIBRARY_FILTERS.RECENT) {
      return {
        title: "No Recently Used NPCs",
        body: "NPCs you import or add to a scene will appear here."
      };
    }
    if (this.#query.trim()) {
      return {
        title: "No Matches",
        body: "No NPCs match your search."
      };
    }
    return {
      title: "No NPCs",
      body: "No NPCs are available in this view."
    };
  }

  async #ensureUserState(service) {
    if (this.#stateLoaded) return;
    const all = await service.getAllNpcs();
    const knownIds = new Set(all.map((npc) => npc.id));

    let favorites = loadUserFavorites();
    let recent = loadUserRecent();

    // One-time migration from legacy localStorage favorites.
    if (!favorites.length) {
      const legacy = NpcBrowser.#loadLegacyLocalFavorites();
      if (legacy.length) {
        favorites = pruneFavorites(legacy, knownIds);
        await saveUserFavorites(favorites);
        try {
          localStorage.removeItem(FAVORITES_KEY);
        } catch (_error) {
          // ignore
        }
      }
    } else {
      const pruned = pruneFavorites(favorites, knownIds);
      if (pruned.length !== favorites.length) {
        favorites = pruned;
        await saveUserFavorites(favorites);
      }
    }

    const prunedRecent = pruneRecent(recent, knownIds);
    if (prunedRecent.length !== recent.length) {
      recent = prunedRecent;
      await saveUserRecent(recent);
    }

    this.#favorites = new Set(favorites);
    this.#recent = recent;
    this.#stateLoaded = true;
  }

  static #loadLegacyLocalFavorites() {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  #bindSearchInput() {
    const searchInput = this.element.querySelector("[data-townforge-search]");
    if (!searchInput || searchInput.dataset.townforgeBound) return;

    searchInput.dataset.townforgeBound = "1";
    searchInput.addEventListener("input", (event) => {
      const input = event.currentTarget;
      const selectionStart = input.selectionStart;
      const selectionEnd = input.selectionEnd;
      this.#query = input.value ?? "";
      this.#page = 1;
      void this.render({ force: false }).then(() => {
        const restored = this.element.querySelector("[data-townforge-search]");
        if (!restored) return;
        restored.focus();
        if (typeof selectionStart === "number" && typeof selectionEnd === "number") {
          restored.setSelectionRange(selectionStart, selectionEnd);
        }
      });
    });
  }

  #bindSortSelect() {
    const sortSelect = this.element.querySelector("[data-townforge-sort]");
    if (!sortSelect || sortSelect.dataset.townforgeBound) return;
    sortSelect.dataset.townforgeBound = "1";
    sortSelect.addEventListener("change", (event) => {
      const value = event.currentTarget.value;
      const allowed = new Set(["name-asc", "name-desc", "recent", "occupation", "category"]);
      this.#sort = allowed.has(value) ? value : "name-asc";
      this.#page = 1;
      void this.render({ force: false });
    });
  }

  #bindImageFallbacks() {
    const images = this.element.querySelectorAll("img[data-townforge-img]");
    for (const img of images) {
      if (img.dataset.townforgeImgBound) continue;
      img.dataset.townforgeImgBound = "1";
      img.addEventListener("error", () => {
        const fallback = img.dataset.fallback;
        if (!fallback || img.getAttribute("src") === fallback) return;
        img.src = fallback;
      });
    }
  }

  /**
   * @param {number} current
   * @param {number} pageCount
   * @returns {{number: number, active: boolean, label: string}[]}
   */
  #buildPages(current, pageCount) {
    if (pageCount <= 0) return [];
    const windowSize = Math.min(5, pageCount);
    let start = Math.max(1, current - Math.floor(windowSize / 2));
    let end = start + windowSize - 1;
    if (end > pageCount) {
      end = pageCount;
      start = Math.max(1, end - windowSize + 1);
    }

    const pages = [];
    for (let i = start; i <= end; i += 1) {
      pages.push({ number: i, active: i === current, label: String(i) });
    }
    return pages;
  }

  /**
   * @param {object} npc
   * @param {{selected?: boolean, detail?: boolean}} [options]
   * @returns {object}
   */
  #decorateNpc(npc, { selected = false, detail = false } = {}) {
    const categoryColor = CATEGORY_COLORS[npc.category] ?? "#8f9aa3";
    const categoryLabel = npc.category
      ? npc.category.charAt(0).toUpperCase() + npc.category.slice(1)
      : "";
    const decorated = {
      ...npc,
      selected,
      favorite: this.#favorites.has(npc.id),
      categoryColor,
      categoryLabel,
      location:
        OCCUPATION_LOCATIONS[npc.occupation] ??
        CATEGORY_LOCATIONS[npc.category] ??
        "Around Town",
      metaLine: `${npc.species} • ${npc.occupation}`
    };

    if (detail) {
      decorated.stats = this.#extractStats(npc);
      decorated.inventory = this.#extractInventory(npc);
      decorated.detailTabs = [
        { id: "bio", label: "Bio", active: this.#detailTab === "bio" },
        { id: "personality", label: "Personality", active: this.#detailTab === "personality" },
        { id: "motivation", label: "Motivation", active: this.#detailTab === "motivation" },
        { id: "secret", label: "Secret (GM)", active: this.#detailTab === "secret", gmOnly: true },
        { id: "stats", label: "Stats", active: this.#detailTab === "stats" },
        { id: "inventory", label: "Inventory", active: this.#detailTab === "inventory" }
      ];
      decorated.activeTabContent = this.#tabContent(npc, decorated);
    }

    return decorated;
  }

  #extractStats(npc) {
    const system = npc.actorData?.system ?? {};
    const abilities = system.abilities ?? {};
    const attrs = system.attributes ?? {};
    const abilityRow = ["str", "dex", "con", "int", "wis", "cha"].map((key) => {
      const value = Number(abilities[key]?.value ?? 10);
      const mod = Math.floor((value - 10) / 2);
      return {
        key: key.toUpperCase(),
        value,
        mod: mod >= 0 ? `+${mod}` : `${mod}`
      };
    });

    return {
      ac: attrs.ac?.flat ?? attrs.ac?.value ?? 10,
      hp: attrs.hp?.value ?? attrs.hp?.max ?? 4,
      hpMax: attrs.hp?.max ?? attrs.hp?.value ?? 4,
      speed: attrs.movement?.walk ?? 30,
      proficiency: attrs.prof ?? 2,
      abilities: abilityRow,
      cr: system.details?.cr ?? 0
    };
  }

  #extractInventory(npc) {
    const items = Array.isArray(npc.actorData?.items) ? npc.actorData.items : [];
    return items.map((item) => ({
      name: item?.name ?? "Unknown Item",
      type: item?.type ?? "item"
    }));
  }

  #tabContent(npc, decorated) {
    switch (this.#detailTab) {
      case "personality":
        return { isText: true, text: npc.personality };
      case "motivation":
        return { isText: true, text: npc.motivation };
      case "secret":
        return { isSecret: true, text: npc.secret };
      case "stats":
        return { isStats: true, stats: decorated.stats };
      case "inventory":
        return { isInventory: true, inventory: decorated.inventory };
      case "bio":
      default:
        return { isText: true, text: npc.biography };
    }
  }

  async #touchRecent(npcId) {
    this.#recent = await recordUserRecentNpc(npcId);
  }

  /** @this {NpcBrowser} */
  static async #onSetCategory(_event, target) {
    const category = target.dataset.category;
    if (!category || category === this.#category) {
      this.#moreOpen = false;
      await this.render({ force: false });
      return;
    }
    this.#category = category;
    this.#page = 1;
    this.#moreOpen = false;
    await this.render({ force: false });
  }

  /** @this {NpcBrowser} */
  static async #onToggleMore() {
    this.#moreOpen = !this.#moreOpen;
    await this.render({ force: false });
  }

  /** @this {NpcBrowser} */
  static async #onSelectNpc(_event, target) {
    const npcId = target.dataset.npcId;
    if (!npcId || npcId === this.#selectedNpcId) return;
    this.#selectedNpcId = npcId;
    this.#detailTab = "bio";
    await this.render({ force: false });
  }

  /** @this {NpcBrowser} */
  static async #onSetPage(_event, target) {
    const page = Number(target.dataset.page);
    if (!Number.isFinite(page) || page < 1 || page === this.#page) return;
    this.#page = page;
    await this.render({ force: false });
  }

  /** @this {NpcBrowser} */
  static async #onSetDetailTab(_event, target) {
    const tab = target.dataset.tab;
    if (!tab || tab === this.#detailTab) return;
    this.#detailTab = tab;
    await this.render({ force: false });
  }

  /** @this {NpcBrowser} */
  static async #onToggleFavorite(_event, target) {
    const npcId = target.dataset.npcId ?? this.#selectedNpcId;
    if (!npcId) return;
    const result = await toggleUserFavorite(npcId);
    this.#favorites = new Set(result.favorites);
    await this.render({ force: false });
  }

  /** @this {NpcBrowser} */
  static async #onImportActor(event, target) {
    event.preventDefault();
    const npcId = target.dataset.npcId ?? this.#selectedNpcId;
    const npc = npcId ? await npcService.getNpcById(npcId) : null;
    if (!npc) {
      ui.notifications?.error("TownForge could not find that NPC.");
      return;
    }
    target.disabled = true;
    try {
      const result = await actorService.importActor(npc);
      if (result?.actor) {
        await this.#touchRecent(npc.id);
        await this.render({ force: false });
      }
    } finally {
      target.disabled = false;
    }
  }

  /** @this {NpcBrowser} */
  static async #onAddToScene(event, target) {
    event.preventDefault();
    const npcId = target.dataset.npcId ?? this.#selectedNpcId;
    const npc = npcId ? await npcService.getNpcById(npcId) : null;
    if (!npc) {
      ui.notifications?.error("TownForge could not find that NPC.");
      return;
    }
    target.disabled = true;
    try {
      const result = await actorService.addNpcToScene(npc);
      if (result?.token) {
        await this.#touchRecent(npc.id);
        await this.render({ force: false });
      }
    } finally {
      target.disabled = false;
    }
  }
}
