import { actorService } from "./actor-service.js";
import {
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
import { getHandlebarsApplicationV2Base } from "./app-api.js";

const HandlebarsApplicationV2 = getHandlebarsApplicationV2Base();

/** NPC library browser. */
export class NpcBrowser extends HandlebarsApplicationV2 {
  /** @type {string} */
  #query = "";

  /** @type {string} */
  #category = "all";

  /** @type {string|null} */
  #selectedNpcId = null;

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

  /** @type {"portrait"|"token"} */
  #artPreviewMode = "portrait";

  /** @type {boolean} */
  #artPreviewHydrated = false;

  static ART_PREVIEW_KEY = `${MODULE_ID}.npc-art-preview`;

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
      setDetailTab: this.#onSetDetailTab,
      toggleFavorite: this.#onToggleFavorite,
      setArtPreview: this.#onSetArtPreview,
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
    if (!this.#artPreviewHydrated) {
      this.#artPreviewMode = NpcBrowser.#loadArtPreviewMode();
      this.#artPreviewHydrated = true;
    }
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
    const gridNpcs = npcs.map((npc) =>
      this.#decorateNpc(npc, { selected: npc.id === this.#selectedNpcId })
    );

    let selectedNpc = this.#selectedNpcId
      ? await npcService.getNpcById(this.#selectedNpcId)
      : null;

    if (this.#selectedNpcId && !selectedNpc) {
      this.#selectedNpcId = null;
    }

    if (!selectedNpc && gridNpcs.length) {
      this.#selectedNpcId = gridNpcs[0].id;
      selectedNpc = await npcService.getNpcById(this.#selectedNpcId);
      gridNpcs[0].selected = true;
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
      npcs: gridNpcs,
      selectedNpc: selectedNpc ? this.#decorateNpc(selectedNpc, { detail: true }) : null,
      resultCount: totalCount,
      sortAsc: this.#sort === "name-asc",
      sortDesc: this.#sort === "name-desc",
      sortRecent: this.#sort === "recent",
      sortOccupation: this.#sort === "occupation",
      sortCategory: this.#sort === "category",
      detailTab: this.#detailTab,
      showTokenArt: this.#artPreviewMode === "token",
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

  static #loadArtPreviewMode() {
    try {
      const stored = localStorage.getItem(NpcBrowser.ART_PREVIEW_KEY);
      return stored === "token" ? "token" : "portrait";
    } catch {
      return "portrait";
    }
  }

  #saveArtPreviewMode(mode) {
    try {
      localStorage.setItem(NpcBrowser.ART_PREVIEW_KEY, mode);
    } catch {
      // ignore
    }
  }

  #previewImage(npc) {
    if (this.#artPreviewMode === "token") {
      return npc.token || npc.portrait;
    }
    return npc.portrait;
  }

  #previewFallback(npc) {
    if (this.#artPreviewMode === "token") {
      return npc.fallbackToken || npc.fallbackPortrait;
    }
    return npc.fallbackPortrait;
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
      previewImage: this.#previewImage(npc),
      previewFallback: this.#previewFallback(npc),
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
    return items.map((item) => {
      if (item?.compendium) {
        const slug = String(item.compendium).split(".").pop() ?? "item";
        const label = slug
          .split("-")
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
        return { name: label || slug, type: item.type ?? "item" };
      }
      return {
        name: item?.name ?? "Unknown Item",
        type: item?.type ?? "item"
      };
    });
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
  static async #onSetDetailTab(_event, target) {
    const tab = target.dataset.tab;
    if (!tab || tab === this.#detailTab) return;
    this.#detailTab = tab;
    await this.render({ force: false });
  }

  /** @this {NpcBrowser} */
  static async #onSetArtPreview(_event, target) {
    const mode = target.dataset.mode;
    if (!mode || mode === this.#artPreviewMode) return;
    if (mode !== "portrait" && mode !== "token") return;
    this.#artPreviewMode = mode;
    this.#saveArtPreviewMode(mode);
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
