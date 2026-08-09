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

  get title() {
    return `TownForge Shopkeeper — ${this.#actor?.name ?? "NPC"}`;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const shop = shopService.getShopkeeper(this.#actor);
    const partyLevel = shopService.getEffectivePartyLevel(shop);

    return Object.assign(context, {
      actorId: this.#actor.id,
      actorName: this.#actor.name,
      shop,
      partyLevel,
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
          selected: shop.partyLevelMode === PARTY_LEVEL_MODES.fixed
        }
      ],
      inventory: (shop.inventory ?? []).map((entry) => ({
        ...entry,
        sourceLabel: entry.source === "manual" ? "Manual" : "Auto"
      })),
      shopTypeLabel: getShopTypeLabel(shop.shopType)
    });
  }

  /**
   * @this {ShopkeeperConfig}
   */
  static async #onSubmit(_event, form, formData) {
    if (!game.user.isGM) return;
    const data = formData.object;
    const enabled = Boolean(data.enabled);
    const current = shopService.getShopkeeper(this.#actor);
    let shopType = String(data.shopType || current.shopType || "general-store");

    // First enable: infer shop type from occupation when still on the default store type.
    if (enabled && !current.enabled && shopType === "general-store") {
      shopType = shopService.inferShopType(shopService.getOccupationHint(this.#actor));
    }

    const patch = {
      enabled,
      shopType,
      shopName: String(data.shopName || ""),
      inventoryMode: String(data.inventoryMode || INVENTORY_MODES.automatic),
      economyTier: String(data.economyTier || "standard"),
      partyLevelMode: String(data.partyLevelMode || PARTY_LEVEL_MODES.auto),
      fixedPartyLevel: data.fixedPartyLevel ? Number(data.fixedPartyLevel) : null,
      priceMultiplier: Number(data.priceMultiplier) || 1
    };

    await shopService.updateShopkeeper(this.#actor, patch);

    if (enabled && patch.inventoryMode === INVENTORY_MODES.automatic) {
      await shopService.regenerateInventory(this.#actor, { force: true });
    }

    console.log(`${LOG_PREFIX} Shopkeeper config saved for ${this.#actor.name}`);
    ui.notifications?.info(`TownForge shopkeeper settings saved for ${this.#actor.name}.`);
    await this.render({ force: false });
  }

  /** @this {ShopkeeperConfig} */
  static async #onRegenerate() {
    await shopService.regenerateInventory(this.#actor, { force: true });
    ui.notifications?.info("TownForge regenerated shop inventory.");
    await this.render({ force: false });
  }

  /** @this {ShopkeeperConfig} */
  static async #onResetAutomatic() {
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
