import { actorService } from "./actor-service.js";
import { LOG_PREFIX, MODULE_ID, MODULE_TITLE } from "./constants.js";
import { npcService } from "./npc-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * TownForge NPC Browser
 *
 * Simple GM-facing ApplicationV2 UI:
 * - Search + category filters
 * - Card grid of NPCs
 * - Detail/preview pane with Add to Scene
 */
export class NpcBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {string} */
  #query = "";

  /** @type {string} */
  #category = "all";

  /** @type {string|null} */
  #selectedNpcId = null;

  /** @type {object[]} */
  #npcs = [];

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
    main: {
      template: `modules/${MODULE_ID}/templates/npc-browser.hbs`,
      templates: [`modules/${MODULE_ID}/templates/npc-details.hbs`]
    }
  };

  /**
   * Open or focus the singleton browser instance.
   * @returns {Promise<NpcBrowser>}
   */
  static async show() {
    const existing = foundry.applications.instances.get("townforge-npc-browser");
    if (existing instanceof NpcBrowser) {
      await existing.render({ force: true });
      existing.bringToFront?.();
      return existing;
    }

    const app = new NpcBrowser();
    await app.render({ force: true });
    return app;
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    await npcService.ready();

    this.#npcs = await npcService.searchNpcs({
      category: this.#category,
      query: this.#query
    });

    const selectedNpc = this.#selectedNpcId
      ? await npcService.getNpcById(this.#selectedNpcId)
      : null;

    // If the selected NPC is filtered out of the current list, still show it in detail mode.
    const categories = npcService.getCategories().map((category) => ({
      ...category,
      active: category.id === this.#category
    }));

    return Object.assign(context, {
      title: MODULE_TITLE,
      query: this.#query,
      category: this.#category,
      categories,
      npcs: this.#npcs,
      selectedNpc,
      showingDetails: Boolean(selectedNpc),
      resultCount: this.#npcs.length
    });
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender?.(context, options);

    const searchInput = this.element.querySelector("[data-townforge-search]");
    if (!searchInput || searchInput.dataset.townforgeBound) return;

    searchInput.dataset.townforgeBound = "1";
    searchInput.addEventListener("input", (event) => {
      const input = event.currentTarget;
      const selectionStart = input.selectionStart;
      const selectionEnd = input.selectionEnd;

      this.#query = input.value ?? "";
      // Keep detail view closed while searching so results stay visible.
      if (this.#selectedNpcId) this.#selectedNpcId = null;

      void this.render({ parts: ["main"] }).then(() => {
        const restored = this.element.querySelector("[data-townforge-search]");
        if (!restored) return;
        restored.focus();
        if (typeof selectionStart === "number" && typeof selectionEnd === "number") {
          restored.setSelectionRange(selectionStart, selectionEnd);
        }
      });
    });
  }

  /**
   * @this {NpcBrowser}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target
   */
  static async #onSetCategory(_event, target) {
    const category = target.dataset.category;
    if (!category) return;

    this.#category = category;
    this.#selectedNpcId = null;
    console.log(`${LOG_PREFIX} Category filter set to "${category}"`);
    await this.render({ parts: ["main"] });
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
    console.log(`${LOG_PREFIX} Opening NPC details for "${npcId}"`);
    await this.render({ parts: ["main"] });
  }

  /**
   * @this {NpcBrowser}
   */
  static async #onBackToList() {
    this.#selectedNpcId = null;
    await this.render({ parts: ["main"] });
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
      console.log(`${LOG_PREFIX} Add to Scene requested for "${npc.name}"`);
      const result = await actorService.addNpcToScene(npc);

      if (!result.actor) return;

      const reuseNote = result.createdActor ? "created Actor and" : "reused Actor and";
      ui.notifications?.info(`TownForge ${reuseNote} placed ${npc.name}.`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to add NPC to scene`, error);
      ui.notifications?.error(`TownForge failed to add ${npc.name} to the scene.`);
    } finally {
      target.disabled = false;
    }
  }
}
