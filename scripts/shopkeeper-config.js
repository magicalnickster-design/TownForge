import { LOG_PREFIX, MODULE_ID } from "./constants.js";
import {
  ECONOMY_TIERS,
  INVENTORY_MODES,
  PARTY_LEVEL_MODES,
  SHOP_TYPES
} from "./shop-constants.js";
import { getShopTypeLabel, shopService } from "./shop-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Compact GM-only TownForge Shopkeeper configuration window.
 */
export class ShopkeeperConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {Actor} */
  #actor;

  /** @type {string} */
  actorId = "";

  static DEFAULT_OPTIONS = {
    id: "townforge-shopkeeper-config",
    classes: ["townforge", "townforge-shopkeeper-config"],
    tag: "form",
    form: {
      handler: this.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false
    },
    window: {
      title: "TownForge Shopkeeper",
      resizable: true,
      contentClasses: ["townforge-window-content"]
    },
    position: { width: 520, height: "auto" },
    actions: {
      regenerate: this.#onRegenerate,
      resetAutomatic: this.#onResetAutomatic,
      removeStock: this.#onRemoveStock,
      editStock: this.#onEditStock,
      openMerchant: this.#onOpenMerchant,
      openItemSources: this.#onOpenItemSources,
      addSelectedItem: this.#onAddSelectedItem
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/shop/shopkeeper-config.hbs`,
      scrollable: [".townforge-shop-config-scroll"]
    }
  };

  constructor(actor, options = {}) {
    super(options);
    this.#actor = actor;
    this.actorId = actor?.id ?? "";
  }

  static async show(actor) {
    if (!actor) return null;
    const existing = [...foundry.applications.instances.values()].find(
      (app) => app instanceof ShopkeeperConfig && app.actorId === actor.id
    );
    if (existing) {
      await existing.render({ force: true });
      existing.bringToFront?.();
      return existing;
    }
    const app = new ShopkeeperConfig(actor);
    await app.render({ force: true });
    return app;
  }

  /**
   * @param {Set<string>|string[]|string|Actor} merchantRef
   * @returns {boolean}
   */
  matchesMerchant(merchantRef) {
    const keys =
      merchantRef instanceof Set
        ? merchantRef
        : new Set(
            typeof merchantRef === "string"
              ? [merchantRef]
              : Array.isArray(merchantRef)
                ? merchantRef
                : [merchantRef?.id, merchantRef?.uuid].filter(Boolean)
          );
    return keys.has(this.actorId) || keys.has(this.#actor?.id) || keys.has(this.#actor?.uuid);
  }

  get title() {
    return `TownForge Shopkeeper — ${this.#actor?.name ?? "NPC"}`;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const shop = shopService.getShopkeeper(this.#actor);
    const partyLevel = shopService.getEffectivePartyLevel(shop);
    const isFixedPartyLevel = shop.partyLevelMode === PARTY_LEVEL_MODES.fixed;
    const fixedLevelValue = Math.max(
      1,
      Math.min(20, Number(shop.fixedPartyLevel) || partyLevel || 1)
    );

    return Object.assign(context, {
      actorId: this.#actor.id,
      actorName: this.#actor.name,
      shop,
      partyLevel,
      isFixedPartyLevel,
      fixedPartyLevels: Array.from({ length: 20 }, (_, index) => {
        const value = index + 1;
        return {
          value,
          label: `Level ${value}`,
          selected: value === fixedLevelValue
        };
      }),
      shopTypes: SHOP_TYPES.map((entry) => ({
        ...entry,
        selected: entry.id === shop.shopType
      })),
      economyTiers: Object.values(ECONOMY_TIERS).map((tier) => ({
        ...tier,
        selected: tier.id === shop.economyTier
      })),
      inventoryModes: [
        {
          id: INVENTORY_MODES.automatic,
          label: "Automatic",
          selected: shop.inventoryMode === INVENTORY_MODES.automatic
        },
        {
          id: INVENTORY_MODES.manual,
          label: "Manual",
          selected: shop.inventoryMode === INVENTORY_MODES.manual
        }
      ],
      partyLevelModes: [
        {
          id: PARTY_LEVEL_MODES.auto,
          label: "Auto Detect",
          selected: shop.partyLevelMode === PARTY_LEVEL_MODES.auto
        },
        {
          id: PARTY_LEVEL_MODES.fixed,
          label: "Fixed Level",
          selected: isFixedPartyLevel
        }
      ],
      inventory: (shop.inventory ?? []).map((entry) => ({
        ...entry,
        sourceLabel: entry.source === "manual" ? "Manual" : "Auto",
        isManual: entry.source === "manual"
      })),
      shopTypeLabel: getShopTypeLabel(shop.shopType)
    });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#bindPartyLevelControls();
  }

  #bindPartyLevelControls() {
    const modeSelect = this.element?.querySelector?.("[data-townforge-party-mode]");
    const fixedSelect = this.element?.querySelector?.("[data-townforge-fixed-level]");
    const fixedLabel = this.element?.querySelector?.(".townforge-fixed-level");
    if (!modeSelect || !fixedSelect || modeSelect.dataset.bound === "1") return;
    modeSelect.dataset.bound = "1";

    const sync = () => {
      const fixed = modeSelect.value === PARTY_LEVEL_MODES.fixed;
      fixedSelect.disabled = !fixed;
      fixedLabel?.classList.toggle("is-disabled", !fixed);
      if (fixed && !fixedSelect.value) {
        fixedSelect.value = String(shopService.getEffectivePartyLevel(shopService.getShopkeeper(this.#actor)));
      }
    };

    modeSelect.addEventListener("change", sync);
    sync();
  }

  /**
   * Read current form fields into a shopkeeper patch.
   * @returns {object|null}
   */
  #readFormPatch() {
    const form = this.element;
    if (!form) return null;
    const get = (name) => form.querySelector(`[name="${name}"]`);
    const enabledInput = get("enabled");
    const partyLevelMode = String(get("partyLevelMode")?.value || PARTY_LEVEL_MODES.auto);
    const fixedRaw = get("fixedPartyLevel")?.value;
    const fixedPartyLevel =
      partyLevelMode === PARTY_LEVEL_MODES.fixed
        ? Math.max(1, Math.min(20, Number(fixedRaw) || 1))
        : Math.max(1, Math.min(20, Number(fixedRaw) || shopService.getEffectivePartyLevel(shopService.getShopkeeper(this.#actor)) || 1));

    return {
      enabled: Boolean(enabledInput?.checked),
      shopType: String(get("shopType")?.value || "general-store"),
      shopName: String(get("shopName")?.value || ""),
      inventoryMode: String(get("inventoryMode")?.value || INVENTORY_MODES.automatic),
      economyTier: String(get("economyTier")?.value || "standard"),
      partyLevelMode,
      fixedPartyLevel,
      priceMultiplier: Number(get("priceMultiplier")?.value) || 1
    };
  }

  /**
   * Persist the visible form settings to the actor (without inventing shop type).
   * @param {{regenerate?: boolean, reshuffle?: boolean}} [options]
   */
  async #persistFormSettings(options = {}) {
    if (!game.user.isGM) return shopService.getShopkeeper(this.#actor);
    const patch = this.#readFormPatch();
    if (!patch) return shopService.getShopkeeper(this.#actor);

    await shopService.updateShopkeeper(this.#actor, patch);

    const shouldGenerate =
      Boolean(options.regenerate) &&
      patch.enabled &&
      patch.inventoryMode === INVENTORY_MODES.automatic;

    if (shouldGenerate) {
      await shopService.regenerateInventory(this.#actor, {
        force: true,
        reshuffle: Boolean(options.reshuffle)
      });
    }

    return shopService.getShopkeeper(this.#actor);
  }

  /**
   * @this {ShopkeeperConfig}
   */
  static async #onSubmit(_event, _form, _formData) {
    if (!game.user.isGM) return;
    // Always honor the Shop Type selected in the form (no occupation override).
    await this.#persistFormSettings({ regenerate: true, reshuffle: true });
    console.log(`${LOG_PREFIX} Shopkeeper config saved for ${this.#actor.name}`);
    ui.notifications?.info(`TownForge shopkeeper settings saved for ${this.#actor.name}.`);
    await this.render({ force: false });
  }

  /** @this {ShopkeeperConfig} */
  static async #onRegenerate() {
    if (!game.user.isGM) return;
    // Apply Shop Type / party level / etc. from the form first, then wipe + re-roll.
    await this.#persistFormSettings({ regenerate: false });
    await shopService.regenerateInventory(this.#actor, { force: true, reshuffle: true });
    ui.notifications?.info("TownForge regenerated shop inventory.");
    await this.render({ force: false });
  }

  /** @this {ShopkeeperConfig} */
  static async #onResetAutomatic() {
    const shop = shopService.getShopkeeper(this.#actor);
    const manualCount = (shop.inventory ?? []).filter((entry) => entry.source === "manual").length;
    const confirmed = window.confirm(
      manualCount
        ? `Reset to automatic inventory?\n\nThis will remove ${manualCount} manual item(s) and regenerate stock.`
        : "Reset to automatic inventory and regenerate stock?"
    );
    if (!confirmed) return;
    await this.#persistFormSettings({ regenerate: false });
    await shopService.resetToAutomatic(this.#actor);
    ui.notifications?.info("TownForge reset shop inventory to automatic.");
    await this.render({ force: false });
  }

  /** @this {ShopkeeperConfig} */
  static async #onRemoveStock(_event, target) {
    const stockId = target.dataset.stockId;
    if (!stockId) return;
    await shopService.removeStockEntry(this.#actor, stockId);
    await this.render({ force: false });
  }

  /** @this {ShopkeeperConfig} */
  static async #onEditStock(_event, target) {
    const stockId = target.dataset.stockId;
    if (!stockId) return;
    const shop = shopService.getShopkeeper(this.#actor);
    const entry = (shop.inventory ?? []).find((row) => row.id === stockId);
    if (!entry) return;

    const priceGP = window.prompt(
      `Price in GP for ${entry.name} (current ${entry.priceLabel})`,
      String((Number(entry.priceCP) || 0) / 100)
    );
    if (priceGP == null) return;

    const qtyRaw = window.prompt(
      `Quantity for ${entry.name} (blank = unlimited, current ${entry.quantity == null ? "∞" : entry.quantity})`,
      entry.quantity == null ? "" : String(entry.quantity)
    );
    if (qtyRaw == null) return;

    const priceCP = Math.max(1, Math.round(Number(priceGP) * 100) || 1);
    const quantity = qtyRaw.trim() === "" ? null : Math.max(0, Number(qtyRaw) || 0);
    await shopService.updateStockEntry(this.#actor, stockId, { priceCP, quantity });
    await this.render({ force: false });
  }

  /** @this {ShopkeeperConfig} */
  static async #onOpenMerchant() {
    const { MerchantApp } = await import("./merchant-app.js");
    await MerchantApp.show(this.#actor);
  }

  /** @this {ShopkeeperConfig} */
  static async #onOpenItemSources() {
    const { ShopItemSourcesApp } = await import("./settings.js");
    await ShopItemSourcesApp.show();
  }

  /** @this {ShopkeeperConfig} */
  static async #onAddSelectedItem() {
    const uuid = this.element.querySelector("[data-townforge-manual-uuid]")?.value?.trim();
    if (!uuid) {
      ui.notifications?.warn("Paste an Item UUID to add it to shop stock.");
      return;
    }
    try {
      await shopService.addManualItem(this.#actor, uuid);
      ui.notifications?.info("Added manual shop item.");
      await this.render({ force: false });
    } catch (error) {
      console.error(`${LOG_PREFIX} Manual item add failed`, error);
      ui.notifications?.error("Could not add that Item UUID to the shop.");
    }
  }
}
