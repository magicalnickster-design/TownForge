import { LOG_PREFIX, MODULE_ID } from "./constants.js";
import { getShopTypeLabel, shopService } from "./shop-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Player-facing TownForge merchant window.
 * Does not expose Actor sheet data, secrets, or GM configuration.
 */
export class MerchantApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {Actor} */
  #merchant;

  /** @type {string} */
  merchantId = "";

  /** @type {string} */
  #query = "";

  /** @type {"all"|"weapons"|"armor"|"gear"} */
  #filter = "all";

  /** @type {string|null} */
  #buyerUuid = null;

  static DEFAULT_OPTIONS = {
    id: "townforge-merchant",
    classes: ["townforge", "townforge-merchant"],
    tag: "div",
    window: {
      title: "TownForge Merchant",
      resizable: true,
      contentClasses: ["townforge-window-content"]
    },
    position: { width: 720, height: 720 },
    actions: {
      setFilter: this.#onSetFilter,
      buyItem: this.#onBuyItem,
      openActorSheet: this.#onOpenActorSheet
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/shop/merchant.hbs`,
      scrollable: [".townforge-merchant-list"]
    }
  };

  constructor(merchant, options = {}) {
    super(options);
    this.#merchant = merchant;
    this.merchantId = merchant?.id ?? "";
  }

  static async show(merchant) {
    if (!merchant) return null;
    const shop = shopService.getShopkeeper(merchant);
    if (!shop.enabled) {
      ui.notifications?.warn("This NPC is not an active TownForge shopkeeper.");
      return null;
    }

    // Only the GM may generate stock. Players just browse persisted flags.
    if (
      game.user.isGM &&
      shop.inventoryMode !== "manual" &&
      !(shop.inventory ?? []).length
    ) {
      await shopService.regenerateInventory(merchant, { force: true });
    }

    const existing = [...foundry.applications.instances.values()].find(
      (app) => app instanceof MerchantApp && app.merchantId === merchant.id
    );
    if (existing) {
      await existing.render({ force: true });
      existing.bringToFront?.();
      return existing;
    }

    const app = new MerchantApp(merchant);
    console.log(`${LOG_PREFIX} Merchant window opened for ${merchant.name}`);
    await app.render({ force: true });
    return app;
  }

  get title() {
    const shop = shopService.getShopkeeper(this.#merchant);
    return shop.shopName || `${this.#merchant.name}'s Shop`;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const shop = shopService.getShopkeeper(this.#merchant);
    const inventory = shopService.getSellableInventory(this.#merchant);
    const query = this.#query.trim().toLowerCase();

    const items = inventory
      .filter((entry) => this.#filter === "all" || entry.filter === this.#filter)
      .filter((entry) => {
        if (!query) return true;
        return `${entry.name} ${entry.type}`.toLowerCase().includes(query);
      })
      .map((entry) => ({
        ...entry,
        quantityLabel: entry.quantity == null ? "∞" : String(entry.quantity)
      }));

    const buyers = this.#ownedCharacters();
    if (!this.#buyerUuid && buyers.length === 1) this.#buyerUuid = buyers[0].uuid;
    if (this.#buyerUuid && !buyers.some((buyer) => buyer.uuid === this.#buyerUuid)) {
      this.#buyerUuid = buyers[0]?.uuid ?? null;
    }

    return Object.assign(context, {
      merchantName: this.#merchant.name,
      shopName: shop.shopName || `${this.#merchant.name}'s Shop`,
      shopTypeLabel: getShopTypeLabel(shop.shopType),
      query: this.#query,
      filter: this.#filter,
      filters: [
        { id: "all", label: "All", active: this.#filter === "all" },
        { id: "weapons", label: "Weapons", active: this.#filter === "weapons" },
        { id: "armor", label: "Armor", active: this.#filter === "armor" },
        { id: "gear", label: "Gear", active: this.#filter === "gear" }
      ],
      items,
      buyers,
      buyerUuid: this.#buyerUuid,
      hasBuyer: Boolean(this.#buyerUuid),
      isGM: game.user.isGM
    });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const search = this.element.querySelector("[data-townforge-merchant-search]");
    if (search && !search.dataset.bound) {
      search.dataset.bound = "1";
      search.addEventListener("input", (event) => {
        this.#query = event.currentTarget.value ?? "";
        void this.render({ force: false });
      });
    }

    const buyerSelect = this.element.querySelector("[data-townforge-buyer]");
    if (buyerSelect && !buyerSelect.dataset.bound) {
      buyerSelect.dataset.bound = "1";
      buyerSelect.addEventListener("change", (event) => {
        this.#buyerUuid = event.currentTarget.value || null;
      });
    }
  }

  #ownedCharacters() {
    return (game.actors?.contents ?? [])
      .filter((actor) => actor.isOwner && actor.type === "character")
      .map((actor) => ({
        uuid: actor.uuid,
        id: actor.id,
        name: actor.name,
        selected: actor.uuid === this.#buyerUuid
      }));
  }

  /** @this {MerchantApp} */
  static async #onSetFilter(_event, target) {
    const filter = target.dataset.filter;
    if (!filter || filter === this.#filter) return;
    this.#filter = filter;
    await this.render({ force: false });
  }

  /** @this {MerchantApp} */
  static async #onOpenActorSheet() {
    if (!game.user.isGM) return;
    await this.#merchant.sheet?.render(true);
  }

  /** @this {MerchantApp} */
  static async #onBuyItem(event, target) {
    event.preventDefault();
    const stockId = target.dataset.stockId;
    if (!stockId) return;

    const buyers = this.#ownedCharacters();
    if (!buyers.length) {
      ui.notifications?.warn("You need an owned character to buy items.");
      return;
    }

    // Prefer the dropdown selection; fall back to the only owned character.
    let buyerUuid = this.#buyerUuid || this.element.querySelector("[data-townforge-buyer]")?.value;
    if (!buyerUuid) {
      if (buyers.length > 1) {
        ui.notifications?.warn("Choose a buyer character in the shop window first.");
        return;
      }
      buyerUuid = buyers[0].uuid;
    }
    this.#buyerUuid = buyerUuid;

    target.disabled = true;
    try {
      const result = await shopService.purchaseItem({
        merchantUuid: this.#merchant.uuid,
        buyerUuid,
        stockId
      });
      if (!result.ok) {
        ui.notifications?.warn(result.message || "Purchase failed.");
        return;
      }
      ui.notifications?.info(result.message || "Purchase complete.");
      await this.render({ force: false });
    } finally {
      target.disabled = false;
    }
  }
}
