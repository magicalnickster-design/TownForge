import { actorService } from "./actor-service.js";
import { LOG_PREFIX, MODULE_ID, MODULE_TITLE } from "./constants.js";
import { npcService } from "./npc-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * TownForge NPC Browser
 *
 * ApplicationV2 UI with separate header/content parts so search input
 * updates can re-render the card list without recreating the app window.
 */
export class NpcBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {string} */
  #query = "";

  /** @type {string} */
  #category = "all";

  /** @type {string|null} */
  #selectedNpcId = null;

  static DEFAULT_OPTIONS = {
    id: "townforge-npc-browser",
    classes: ["townforge", "townforge-npc-browser"],
    tag: "div",
    window: {
      title: MODULE_TITLE,
      resizable: true,
      contentClasses: ["townforge-window-content"]
    },
    position: {
      width: 860,
      height: 720
    },
    actions: {
      setCategory: this.#onSetCategory,
      openNpc: this.#onOpenNpc,
      backToList: this.#onBackToList,
      addToScene: this.#onAddToScene
    }
  };

  static PARTS = {
    header: {
      template: `modules/${MODULE_ID}/templates/npc-browser.hbs`
    },
    content: {
      template: `modules/${MODULE_ID}/templates/npc-content.hbs`,
      templates: [`modules/${MODULE_ID}/templates/npc-details.hbs`],
      scrollable: [""]
    }
  };

  /**
   * Open or focus the singleton browser instance.
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

    const npcs = await npcService.searchNpcs({
      category: this.#category,
      query: this.#query
    });

    const selectedNpc = this.#selectedNpcId
      ? await npcService.getNpcById(this.#selectedNpcId)
      : null;

    // Clear stale selection if the NPC disappeared from the library.
    if (this.#selectedNpcId && !selectedNpc) {
      this.#selectedNpcId = null;
    }

    const categories = npcService.getCategories().map((category) => ({
      ...category,
      active: category.id === this.#category
    }));

    return Object.assign(context, {
      title: MODULE_TITLE,
      query: this.#query,
      category: this.#category,
      categories,
      npcs,
      selectedNpc,
      showingDetails: Boolean(selectedNpc),
      resultCount: npcs.length,
      loadFailed: npcService.loadFailed
    });
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#bindSearchInput();
  }

  /**
   * Bind search once per rendered header input.
   * Search updates only re-render the content part.
   */
  #bindSearchInput() {
    const searchInput = this.element.querySelector("[data-townforge-search]");
    if (!searchInput || searchInput.dataset.townforgeBound) return;

    searchInput.dataset.townforgeBound = "1";
    searchInput.addEventListener("input", (event) => {
      this.#query = event.currentTarget.value ?? "";
      if (this.#selectedNpcId) this.#selectedNpcId = null;
      void this.render({ parts: ["content"] });
    });
  }

  /**
   * @this {NpcBrowser}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target
   */
  static async #onSetCategory(_event, target) {
    const category = target.dataset.category;
    if (!category || category === this.#category) return;

    this.#category = category;
    this.#selectedNpcId = null;
    // Header needs active category styles; content needs filtered cards.
    await this.render({ parts: ["header", "content"] });
  }

  /**
   * @this {NpcBrowser}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target
   */
  static async #onOpenNpc(_event, target) {
    const npcId = target.dataset.npcId;
    if (!npcId) return;

    this.#selectedNpcId = npcId;
    await this.render({ parts: ["header", "content"] });
  }

  /**
   * @this {NpcBrowser}
   */
  static async #onBackToList() {
    this.#selectedNpcId = null;
    await this.render({ parts: ["header", "content"] });
  }

  /**
   * @this {NpcBrowser}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onAddToScene(event, target) {
    event.preventDefault();
    const npcId = target.dataset.npcId ?? this.#selectedNpcId;
    if (!npcId) return;

    const npc = await npcService.getNpcById(npcId);
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
