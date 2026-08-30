import { ANNOUNCE_TRADES_SETTING, LOG_PREFIX, MODULE_ID, MODULE_TITLE, SANE_MAGICAL_PRICES_SETTING } from "./constants.js";
import { GambitsAccountSettingsApp } from "./auth-settings-panel.js";
import { shopService } from "./shop-service.js";
import { readySaneMagicalPrices } from "./sane-magical-prices.js";
import { refreshAllOpenShopUIs } from "./shop-sync.js";
import {
  SHOP_ITEM_SOURCES_SETTING,
  discoverInstalledItemPacks,
  getSavedShopItemSourceIds,
  recommendedPackIds,
  sanitizeSelectedPackIds
} from "./shop-sources.js";
import { getHandlebarsApplicationV2Base } from "./app-api.js";

const HandlebarsApplicationV2 = getHandlebarsApplicationV2Base();

/** Module settings. */
export function registerTownForgeSettings() {
  try {
    if (!game.settings.menus?.get?.(`${MODULE_ID}.gambitsAccountMenu`)) {
      game.settings.registerMenu(MODULE_ID, "gambitsAccountMenu", {
        name: "Gambits Forge Account",
        label: "Sign In to Gambits Forge",
        hint: "Connect your Gambits Forge account to unlock Barter & Trade (Tier 1 or higher).",
        icon: "fas fa-right-to-bracket",
        type: GambitsAccountSettingsApp,
        restricted: false
      });
    }

    game.settings.registerMenu(MODULE_ID, "shopItemSourcesMenu", {
      name: "Shopkeeper Item Sources",
      label: "Configure Item Sources",
      hint: "Pick which Item packs feed automatic shop stock.",
      icon: "fas fa-book-open",
      type: ShopItemSourcesApp,
      restricted: true
    });

    game.settings.register(MODULE_ID, SHOP_ITEM_SOURCES_SETTING, {
      name: "Shopkeeper Item Sources",
      hint: "Saved Item pack IDs used when generating shop stock.",
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

    game.settings.register(MODULE_ID, ANNOUNCE_TRADES_SETTING, {
      name: "Announce Shop Trades in Chat",
      hint: "Post completed shop buys and sells to public chat.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      restricted: true
    });

    game.settings.register(MODULE_ID, SANE_MAGICAL_PRICES_SETTING, {
      name: "Use Sane Magical Prices",
      hint: "When enabled, TownForge shops use Saidoro's Sane Magical Prices for matching magic items instead of default compendium prices. Custom catalog items (books, food, apparel) keep their catalog prices.",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      restricted: true,
      onChange: () => {
        console.log(`${LOG_PREFIX} Sane Magical Prices setting updated`);
        void readySaneMagicalPrices()
          .then(() => shopService.refreshSanePricingForAllShopkeepers())
          .catch((error) => {
            console.error(`${LOG_PREFIX} Failed to refresh Sane Magical Prices`, error);
            refreshAllOpenShopUIs();
          });
      }
    });

    registerTownForgeSettingsMenuEnhancements();

    console.log(`${LOG_PREFIX} Settings registered`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Settings registration failed`, error);
    throw error;
  }
}

/**
 * Keep Gambits Forge sign-in first and visually obvious in module settings.
 */
function registerTownForgeSettingsMenuEnhancements() {
  if (registerTownForgeSettingsMenuEnhancements._hooked) return;
  registerTownForgeSettingsMenuEnhancements._hooked = true;

  Hooks.on("renderSettingsConfig", (_app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root?.querySelector) return;

    root.querySelector(".townforge-gambits-auth-panel")?.remove();

    const gambitsGroup = findSettingsMenuGroup(root, "gambitsAccountMenu");
    const shopGroup = findSettingsMenuGroup(root, "shopItemSourcesMenu");
    if (gambitsGroup && shopGroup && gambitsGroup !== shopGroup.parentElement?.firstElementChild) {
      shopGroup.parentElement?.insertBefore(gambitsGroup, shopGroup);
    }

    const signInButton =
      gambitsGroup?.querySelector("button") ??
      root.querySelector(`button[data-key="${MODULE_ID}.gambitsAccountMenu"]`);
    if (signInButton) {
      signInButton.classList.add("townforge-gambits-settings-menu-btn");
      if (!signInButton.querySelector(".fa-right-to-bracket")) {
        signInButton.insertAdjacentHTML("afterbegin", '<i class="fas fa-right-to-bracket" aria-hidden="true"></i> ');
      }
    }
  });
}

/**
 * @param {ParentNode} root
 * @param {string} menuKey
 */
function findSettingsMenuGroup(root, menuKey) {
  const button = root.querySelector(`button[data-key="${MODULE_ID}.${menuKey}"]`);
  if (button) return button.closest(".form-group");
  const groups = [...root.querySelectorAll(".form-group")];
  if (menuKey === "gambitsAccountMenu") {
    return groups.find((group) => /gambits forge account|sign in to gambits forge/i.test(group.textContent ?? ""));
  }
  if (menuKey === "shopItemSourcesMenu") {
    return groups.find((group) => /shopkeeper item sources|configure item sources/i.test(group.textContent ?? ""));
  }
  return null;
}

/** Item pack picker for shop generation. */
export class ShopItemSourcesApp extends HandlebarsApplicationV2 {
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
