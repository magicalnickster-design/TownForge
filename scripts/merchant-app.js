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

  /** @type {string} */
  #filter = "all";

  /** @type {string|null} */
  #buyerUuid = null;

  /** @type {string|null} */
  #selectedStockId = null;

  /** @type {string} */
  #selectedDescription = "";

  /** @type {boolean} */
  #buyerPromptNeeded = false;

  static DEFAULT_OPTIONS = {
    id: "townforge-merchant",
    classes: ["townforge", "townforge-merchant"],
    tag: "div",
    window: {
      title: "TownForge Merchant",
      resizable: true,
      contentClasses: ["townforge-window-content"]
    },
    position: { width: 900, height: 720 },
    actions: {
      setFilter: this.#onSetFilter,
      selectItem: this.#onSelectItem,
      buyItem: this.#onBuyItem,
      openActorSheet: this.#onOpenActorSheet,
      configureShop: this.#onConfigureShop
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
      ui.notifications?.warn("Shop unavailable.");
      return null;
    }

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
    app.#initializeBuyer();
    console.log(`${LOG_PREFIX} Merchant window opened for ${merchant.name}`);
    await app.render({ force: true });
    return app;
  }

  get title() {
    const shop = shopService.getShopkeeper(this.#merchant);
    return shop.shopName || `${this.#merchant.name}'s Shop`;
  }

  #initializeBuyer() {
    const owned = this.#ownedCharacters();
    const assigned = game.user?.character;
    if (assigned?.isOwner && assigned.type === "character") {
      this.#buyerUuid = assigned.uuid;
      this.#buyerPromptNeeded = false;
      return;
    }
    if (owned.length === 1) {
      this.#buyerUuid = owned[0].uuid;
      this.#buyerPromptNeeded = false;
      return;
    }
    if (owned.length > 1) {
      this.#buyerUuid = null;
      this.#buyerPromptNeeded = true;
      ui.notifications?.warn("Choose which character is shopping.");
      return;
    }
    this.#buyerUuid = null;
    this.#buyerPromptNeeded = false;
    ui.notifications?.warn("No owned character available for shopping.");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const shop = shopService.getShopkeeper(this.#merchant);
    const inventory = shopService.getDisplayInventory(this.#merchant);
    const query = this.#query.trim().toLowerCase();
    const filters = shopService.getAvailableFilters(this.#merchant).map((entry) => ({
      ...entry,
      active: entry.id === this.#filter
    }));

    if (this.#filter !== "all" && !filters.some((entry) => entry.id === this.#filter)) {
      this.#filter = "all";
    }

    const items = inventory
      .filter((entry) => this.#filter === "all" || entry.filter === this.#filter)
      .filter((entry) => {
        if (!query) return true;
        return `${entry.name} ${entry.type}`.toLowerCase().includes(query);
      })
      .map((entry) => {
        const soldOut = entry.quantity != null && Number(entry.quantity) <= 0;
        return {
          ...entry,
          quantityLabel: entry.quantity == null ? "∞" : String(entry.quantity),
          soldOut,
          selected: entry.id === this.#selectedStockId,
          canBuy: !soldOut
        };
      });

    const buyers = this.#ownedCharacters();
    if (this.#buyerUuid && !buyers.some((buyer) => buyer.uuid === this.#buyerUuid)) {
      this.#buyerUuid = null;
    }

    const buyerActor = this.#buyerUuid ? await fromUuid(this.#buyerUuid) : null;
    const walletLabel = buyerActor
      ? shopService.formatWallet(buyerActor.system?.currency ?? {})
      : "—";

    let selected = items.find((entry) => entry.id === this.#selectedStockId) ?? null;
    if (!selected && items.length) {
      // Keep prior selection only if still visible; otherwise clear.
      if (this.#selectedStockId) {
        const stillExists = inventory.some((entry) => entry.id === this.#selectedStockId);
        if (!stillExists) {
          this.#selectedStockId = null;
          this.#selectedDescription = "";
        }
      }
    }

    if (selected && !this.#selectedDescription) {
      // Description may still be loading; template can show a placeholder.
    }

    return Object.assign(context, {
      merchantName: this.#merchant.name,
      shopName: shop.shopName || `${this.#merchant.name}'s Shop`,
      shopTypeLabel: getShopTypeLabel(shop.shopType),
      query: this.#query,
      filter: this.#filter,
      filters,
      items,
      buyers,
      buyerUuid: this.#buyerUuid,
      buyerName: buyerActor?.name ?? null,
      hasBuyer: Boolean(this.#buyerUuid),
      needsBuyerChoice: this.#buyerPromptNeeded && buyers.length > 1 && !this.#buyerUuid,
      noCharacters: buyers.length === 0,
      walletLabel,
      selected,
      selectedDescription: this.#selectedDescription,
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
        this.#buyerPromptNeeded = false;
        void this.render({ force: false });
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
  static async #onSelectItem(_event, target) {
    const stockId = target.dataset.stockId;
    if (!stockId) return;
    this.#selectedStockId = stockId;
    this.#selectedDescription = "";
    await this.render({ force: false });

    const shop = shopService.getShopkeeper(this.#merchant);
    const stock = (shop.inventory ?? []).find((entry) => entry.id === stockId);
    if (!stock) return;
    this.#selectedDescription = await shopService.getStockDescription(stock);
    if (this.#selectedStockId === stockId) {
      await this.render({ force: false });
    }
  }

  /** @this {MerchantApp} */
  static async #onOpenActorSheet() {
    if (!game.user.isGM) return;
    await this.#merchant.sheet?.render(true);
  }

  /** @this {MerchantApp} */
  static async #onConfigureShop() {
    if (!game.user.isGM) return;
    const { ShopkeeperConfig } = await import("./shopkeeper-config.js");
    await ShopkeeperConfig.show(this.#merchant);
  }

  /** @this {MerchantApp} */
  static async #onBuyItem(event, target) {
    event.preventDefault();
    event.stopPropagation?.();
    const stockId = target.dataset.stockId || this.#selectedStockId;
    if (!stockId) return;

    const buyers = this.#ownedCharacters();
    if (!buyers.length) {
      ui.notifications?.warn("No owned character available for shopping.");
      return;
    }

    let buyerUuid = this.#buyerUuid || this.element.querySelector("[data-townforge-buyer]")?.value;
    if (!buyerUuid) {
      if (buyers.length > 1) {
        ui.notifications?.warn("Character not selected.");
        return;
      }
      buyerUuid = buyers[0].uuid;
    }
    this.#buyerUuid = buyerUuid;

    if (target.disabled) return;
    target.disabled = true;
    const label = target.textContent;
    target.textContent = "…";

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
      target.textContent = label || "Buy";
    }
  }
}
