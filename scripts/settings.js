import { ANNOUNCE_TRADES_SETTING, LOG_PREFIX, MODULE_ID, MODULE_TITLE } from "./constants.js";
import { shopService } from "./shop-service.js";
import {
  SHOP_ITEM_SOURCES_SETTING,
  discoverInstalledItemPacks,
  getSavedShopItemSourceIds,
  recommendedPackIds,
  sanitizeSelectedPackIds
} from "./shop-sources.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Register TownForge world settings (GM-only shop source menu).
 */
export function registerTownForgeSettings() {
  game.settings.register(MODULE_ID, ANNOUNCE_TRADES_SETTING, {
    name: "Announce Shop Trades in Chat",
    hint: "When enabled, completed buys and sells at TownForge shopkeepers are posted publicly to chat for everyone.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "shopItemSourcesMenu", {
    name: "Shopkeeper Item Sources",
    label: "Configure Item Sources",
    hint: "Choose which installed Item compendiums TownForge may use when generating shopkeeper inventory.",
    icon: "fas fa-book-open",
    type: ShopItemSourcesApp,
    restricted: true
  });

  game.settings.register(MODULE_ID, SHOP_ITEM_SOURCES_SETTING, {
    name: "Shopkeeper Item Sources",
    hint: "World-level list of Item compendium pack IDs used for automatic shop stock.",
    scope: "world",
    config: false,
    type: Array,
    default: [],
    restricted: true,
    onChange: () => {
      shopService.clearItemIndexCache();
      console.log(`${LOG_PREFIX} Shop item sources setting updated`);
    }
  });

  console.log(`${LOG_PREFIX} Settings registered`);
}

/**
 * GM configuration UI for selecting Item compendium sources.
 */
export class ShopItemSourcesApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {Set<string>} */
  #selected = new Set();

  static DEFAULT_OPTIONS = {
    id: "townforge-shop-item-sources",
    classes: ["townforge", "townforge-shop-sources"],
    tag: "form",
    form: {
      handler: this.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    window: {
      title: "TownForge Shopkeeper Item Sources",
      resizable: true,
      contentClasses: ["townforge-window-content"]
    },
    position: { width: 560, height: 640 },
    actions: {
      selectAll: this.#onSelectAll,
      clearAll: this.#onClearAll,
      selectRecommended: this.#onSelectRecommended
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/shop/item-sources.hbs`,
      scrollable: [".townforge-sources-list"]
    }
  };

  static async show() {
    if (!game.user?.isGM) {
      ui.notifications?.warn("Only the GM can configure TownForge item sources.");
      return null;
    }
    const existing = [...foundry.applications.instances.values()].find(
      (app) => app instanceof ShopItemSourcesApp
    );
    if (existing) {
      await existing.render({ force: true });
      existing.bringToFront?.();
      return existing;
    }
    const app = new ShopItemSourcesApp();
    await app.render({ force: true });
    return app;
  }

  // Foundry settings menus instantiate with FormApplication-like options.
  constructor(options = {}) {
    super(options);
    const saved = getSavedShopItemSourceIds();
    const packs = discoverInstalledItemPacks();
    const validSaved = sanitizeSelectedPackIds(saved, packs);
    if (validSaved.length) {
      this.#selected = new Set(validSaved);
    } else {
      // Unsaved suggestion only — generation still requires an explicit Save.
      this.#selected = new Set(recommendedPackIds(packs));
    }
  }

  get title() {
    return `${MODULE_TITLE} — Shopkeeper Item Sources`;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const packs = discoverInstalledItemPacks();
    const saved = sanitizeSelectedPackIds(getSavedShopItemSourceIds(), packs);

    return Object.assign(context, {
      packs: packs.map((pack) => ({
        ...pack,
        checked: this.#selected.has(pack.id)
      })),
      selectedCount: this.#selected.size,
      savedCount: saved.length,
      hasPacks: packs.length > 0,
      hasSaved: saved.length > 0
    });
  }

  /** @this {ShopItemSourcesApp} */
  static async #onSelectAll() {
    for (const pack of discoverInstalledItemPacks()) this.#selected.add(pack.id);
    await this.render({ force: false });
  }

  /** @this {ShopItemSourcesApp} */
  static async #onClearAll() {
    this.#selected.clear();
    await this.render({ force: false });
  }

  /** @this {ShopItemSourcesApp} */
  static async #onSelectRecommended() {
    this.#selected = new Set(recommendedPackIds(discoverInstalledItemPacks()));
    await this.render({ force: false });
  }

  /**
   * @this {ShopItemSourcesApp}
   */
  static async #onSubmit(_event, form, formData) {
    if (!game.user?.isGM) return;

    // Prefer live checkbox state from the form submission.
    const data = formData.object ?? {};
    const fromForm = [];
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith("pack.") || !value) continue;
      fromForm.push(key.slice(5));
    }

    // Also sync any boxes toggled without FormData quirks.
    const checked = [...form.querySelectorAll('input[type="checkbox"][name^="pack."]:checked')].map(
      (input) => input.name.slice(5)
    );
    const chosen = checked.length ? checked : fromForm;

    const packs = discoverInstalledItemPacks();
    const sanitized = sanitizeSelectedPackIds(chosen, packs);
    await game.settings.set(MODULE_ID, SHOP_ITEM_SOURCES_SETTING, sanitized);
    shopService.clearItemIndexCache();

    ui.notifications?.info(
      sanitized.length
        ? `TownForge will use ${sanitized.length} item source pack(s) for shopkeepers.`
        : "TownForge shop item sources cleared. Select packs before generating shop inventory."
    );
    console.log(`${LOG_PREFIX} Saved shop item sources`, sanitized);
  }
}
