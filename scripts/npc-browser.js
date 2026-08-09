import { actorService } from "./actor-service.js";
import {
  BROWSER_PAGE_SIZE,
  CATEGORY_COLORS,
  CATEGORY_LOCATIONS,
  FAVORITES_KEY,
  LOG_PREFIX,
  MODULE_ID,
  MODULE_TITLE,
  PRIMARY_CATEGORY_IDS
} from "./constants.js";
import { npcService } from "./npc-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * TownForge NPC Browser — split-pane library UI inspired by the product mockup.
 */
export class NpcBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {string} */
  #query = "";

  /** @type {string} */
  #category = "all";

  /** @type {string|null} */
  #selectedNpcId = null;

  /** @type {number} */
  #page = 1;

  /** @type {"name-asc"|"name-desc"} */
  #sort = "name-asc";

  /** @type {"bio"|"personality"|"motivation"|"secret"|"stats"|"inventory"} */
  #detailTab = "bio";

  /** @type {boolean} */
  #moreOpen = false;

  /** @type {Set<string>} */
  #favorites = NpcBrowser.#loadFavorites();

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

    let npcs = await npcService.searchNpcs({
      category: this.#category,
      query: this.#query
    });

    npcs = this.#sortNpcs(npcs);
    const totalCount = npcs.length;
    const pageCount = Math.max(1, Math.ceil(totalCount / BROWSER_PAGE_SIZE));
    if (this.#page > pageCount) this.#page = pageCount;

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

    // Auto-select first visible NPC so the right pane is never empty when results exist.
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

    const moreCategories = allCategories
      .filter((category) => category.id !== "all" && !PRIMARY_CATEGORY_IDS.includes(category.id))
      .map((category) => ({
        ...category,
        active: category.id === this.#category
      }));

    const moreActive = moreCategories.some((category) => category.active);

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
      detailTab: this.#detailTab,
      loadFailed: npcService.loadFailed
    });
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#bindSearchInput();
    this.#bindSortSelect();
    this.#bindImageFallbacks();
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
      this.#sort = event.currentTarget.value === "name-desc" ? "name-desc" : "name-asc";
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
   * @param {object[]} npcs
   * @returns {object[]}
   */
  #sortNpcs(npcs) {
    const sorted = npcs.slice().sort((a, b) => a.name.localeCompare(b.name));
    if (this.#sort === "name-desc") sorted.reverse();
    return sorted;
  }

  /**
   * @param {number} current
   * @param {number} pageCount
   * @returns {{number: number, active: boolean, label: string}[]}
   */
  #buildPages(current, pageCount) {
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
      location: CATEGORY_LOCATIONS[npc.category] ?? "Town",
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

  /**
   * @param {object} npc
   * @returns {object}
   */
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

  /**
   * @param {object} npc
   * @returns {{name: string, type: string}[]}
   */
  #extractInventory(npc) {
    const items = Array.isArray(npc.actorData?.items) ? npc.actorData.items : [];
    return items.map((item) => ({
      name: item?.name ?? "Unknown Item",
      type: item?.type ?? "item"
    }));
  }

  /**
   * @param {object} npc
   * @param {object} decorated
   * @returns {object}
   */
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

  static #loadFavorites() {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return new Set();
    }
  }

  #persistFavorites() {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...this.#favorites]));
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
    if (this.#favorites.has(npcId)) this.#favorites.delete(npcId);
    else this.#favorites.add(npcId);
    this.#persistFavorites();
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
      await actorService.importActor(npc);
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
      await actorService.addNpcToScene(npc);
    } finally {
      target.disabled = false;
    }
  }
}
