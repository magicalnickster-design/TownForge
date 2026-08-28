import { LOG_PREFIX, MODULE_ID } from "./constants.js";
import { bindItemDropZone, parseDroppedItemUuid } from "./shop-drop.js";
import { currencyToCopper, normalizeCurrency } from "./shop-currency.js";
import {
  isUnlimitedStock,
  itemQtyBadge,
  normalizeRarity,
  rarityLabel,
  stockQuantityLabel
} from "./shop-constants.js";
import { MERCHANT_PRICE_FILTERS, matchesMerchantPriceFilter } from "./shop-price-filters.js";
import { getShopTypeLabel, shopService } from "./shop-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Open size is 2× the previous 1180×700 default, then clamped to the viewport. */
const MERCHANT_OPEN_WIDTH = 2360;
const MERCHANT_OPEN_HEIGHT = 1400;

/** Merchant trade window — player inventory, offer tray, shop stock. */
export class MerchantApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {Actor} */
  #merchant;

  /** @type {string} */
  merchantId = "";

  /** @type {string} */
  #query = "";

  /** @type {string} */
  #playerQuery = "";

  /** @type {string} */
  #filter = "all";

  /** @type {string} */
  #priceFilter = "all";

  /** @type {string|null} */
  #buyerUuid = null;

  /** @type {boolean} */
  #buyerPromptNeeded = false;

  /** @type {Map<string, number>} stockId → quantity */
  #buyOffer = new Map();

  /** @type {Map<string, number>} itemId → quantity */
  #sellOffer = new Map();

  /** @type {boolean} */
  #busy = false;

  /** @type {number} */
  #hoverSeq = 0;

  static DEFAULT_OPTIONS = {
    id: "townforge-merchant",
    classes: ["townforge", "townforge-merchant", "townforge-trade"],
    tag: "div",
    window: {
      title: "TownForge Merchant",
      resizable: true,
      contentClasses: ["townforge-window-content"]
    },
    position: { width: MERCHANT_OPEN_WIDTH, height: MERCHANT_OPEN_HEIGHT },
    actions: {
      setFilter: MerchantApp.#onSetFilter,
      setPriceFilter: MerchantApp.#onSetPriceFilter,
      toggleBuy: MerchantApp.#onToggleBuy,
      toggleSell: MerchantApp.#onToggleSell,
      removeBuy: MerchantApp.#onRemoveBuy,
      removeSell: MerchantApp.#onRemoveSell,
      adjustBuyQty: MerchantApp.#onAdjustBuyQty,
      adjustSellQty: MerchantApp.#onAdjustSellQty,
      clearOffer: MerchantApp.#onClearOffer,
      confirmTrade: MerchantApp.#onConfirmTrade,
      configureShop: MerchantApp.#onConfigureShop
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/shop/merchant.hbs`,
      scrollable: [".townforge-trade-list", ".townforge-trade-offer-scroll"]
    }
  };

  constructor(merchant, options = {}) {
    super(options);
    this.#merchant = merchant;
    this.merchantId = merchant?.id ?? "";
  }

  static async show(merchant) {
    if (!merchant) return null;
    try {
      const shop = shopService.getShopkeeper(merchant);
      if (!shop.enabled) {
        ui.notifications?.warn("Shop unavailable.");
        return null;
      }

      // GM upgrades ownership so later player trades stay instant (no socket wait).
      if (game.user.isGM) {
        await shopService.ensurePlayerShopAccess(merchant);
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
      app.#applyOpenSize();
      return app;
    } catch (error) {
      console.error(`${LOG_PREFIX} MerchantApp.show failed`, error);
      ui.notifications?.error("TownForge could not open the shop.");
      return null;
    }
  }

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
    return keys.has(this.merchantId) || keys.has(this.#merchant?.id) || keys.has(this.#merchant?.uuid);
  }

  refreshIfBuyer(buyerKeys) {
    if (!this.#buyerUuid || !buyerKeys?.size) return false;
    return buyerKeys.has(this.#buyerUuid);
  }

  get title() {
    const shop = shopService.getShopkeeper(this.#merchant);
    return shop.shopName || `${this.#merchant.name}'s Shop`;
  }

  #initializeBuyer() {
    this.#buyerUuid = null;
    this.#buyerPromptNeeded = false;
    // GMs own every actor, so they must not be prompted to trade as a player.
    if (game.user?.isGM) return;

    const owned = this.#ownedCharacters();
    const assigned = game.user?.character;
    if (assigned?.isOwner && assigned.type === "character") {
      this.#buyerUuid = assigned.uuid;
      return;
    }
    if (owned.length === 1) {
      this.#buyerUuid = owned[0].uuid;
      return;
    }
    if (owned.length > 1) {
      this.#buyerPromptNeeded = true;
      ui.notifications?.warn("Choose which character is trading.");
      return;
    }
    ui.notifications?.warn("No owned character available for trading.");
  }

  #merchantGreeting() {
    const raw =
      this.#merchant.system?.details?.biography?.value ??
      this.#merchant.system?.details?.biography ??
      "";
    const text = String(raw)
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "";
    return text.slice(0, 180) + (text.length > 180 ? "…" : "");
  }

  #walletContext(currency) {
    const normalized = normalizeCurrency(currency);
    const coins = [
      { key: "pp", label: "PP", count: normalized.pp },
      { key: "gp", label: "GP", count: normalized.gp },
      { key: "ep", label: "EP", count: normalized.ep },
      { key: "sp", label: "SP", count: normalized.sp },
      { key: "cp", label: "CP", count: normalized.cp }
    ].map((coin) => ({ ...coin, empty: coin.count <= 0 }));

    let walletPrimary = "0 gp";
    if (normalized.pp > 0) walletPrimary = `${normalized.pp} pp`;
    else if (normalized.gp > 0) walletPrimary = `${normalized.gp} gp`;
    else if (normalized.ep > 0) walletPrimary = `${normalized.ep} ep`;
    else if (normalized.sp > 0) walletPrimary = `${normalized.sp} sp`;
    else if (normalized.cp > 0) walletPrimary = `${normalized.cp} cp`;

    return {
      walletPrimary,
      walletCoins: coins,
      walletCP: currencyToCopper(normalized)
    };
  }

  #isSellable(item) {
    if (!item) return false;
    const type = String(item.type || "");
    if (!["weapon", "equipment", "consumable", "tool", "loot", "container"].includes(type)) {
      return false;
    }
    if (item.system?.equipped) return false;
    return true;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const shop = shopService.getShopkeeper(this.#merchant);
    const inventory = shopService.getDisplayInventory(this.#merchant);
    const query = this.#query.trim().toLowerCase();
    const playerQuery = this.#playerQuery.trim().toLowerCase();
    const filters = shopService.getAvailableFilters(this.#merchant).map((entry) => ({
      ...entry,
      active: entry.id === this.#filter
    }));

    if (this.#filter !== "all" && !filters.some((entry) => entry.id === this.#filter)) {
      this.#filter = "all";
    }

    const isGM = Boolean(game.user?.isGM);
    const buyers = isGM ? [] : this.#ownedCharacters();
    if (isGM || (this.#buyerUuid && !buyers.some((buyer) => buyer.uuid === this.#buyerUuid))) {
      this.#buyerUuid = null;
    }

    const buyerActor = this.#buyerUuid ? await fromUuid(this.#buyerUuid) : null;
    const wallet = this.#walletContext(buyerActor?.system?.currency ?? {});

    // Prune stale offer lines against live stock / inventory.
    for (const stockId of [...this.#buyOffer.keys()]) {
      const stock = inventory.find((entry) => entry.id === stockId);
      if (!stock || (!isUnlimitedStock(stock) && Number(stock.quantity) <= 0)) {
        this.#buyOffer.delete(stockId);
        continue;
      }
      const maxQty = isUnlimitedStock(stock)
        ? 99
        : Math.max(1, Math.min(99, Number(stock.quantity) || 1));
      this.#buyOffer.set(stockId, Math.max(1, Math.min(maxQty, this.#buyOffer.get(stockId) || 1)));
    }
    if (buyerActor) {
      for (const itemId of [...this.#sellOffer.keys()]) {
        const item = buyerActor.items?.get?.(itemId);
        if (!item || !this.#isSellable(item)) {
          this.#sellOffer.delete(itemId);
          continue;
        }
        const maxQty = Math.max(1, Math.min(99, Number(item.system?.quantity) || 1));
        this.#sellOffer.set(itemId, Math.max(1, Math.min(maxQty, this.#sellOffer.get(itemId) || 1)));
      }
    } else {
      this.#sellOffer.clear();
    }

    const priceFilters = MERCHANT_PRICE_FILTERS.map((entry) => ({
      ...entry,
      active: entry.id === this.#priceFilter
    }));

    const items = inventory
      .filter((entry) => this.#filter === "all" || entry.filter === this.#filter)
      .filter((entry) => matchesMerchantPriceFilter(entry.priceCP, this.#priceFilter, wallet.walletCP))
      .filter((entry) => {
        if (!query) return true;
        return `${entry.name} ${entry.type}`.toLowerCase().includes(query);
      })
      .map((entry) => {
        const soldOut = !isUnlimitedStock(entry) && Number(entry.quantity) <= 0;
        const rarityClass = normalizeRarity(entry.rarity);
        return {
          ...entry,
          quantityLabel: stockQuantityLabel(entry),
          qtyBadge: itemQtyBadge(entry),
          rarityClass,
          soldOut,
          inOffer: this.#buyOffer.has(entry.id)
        };
      });

    const playerItems = [];
    if (buyerActor) {
      for (const item of buyerActor.items ?? []) {
        if (!this.#isSellable(item)) continue;
        if (playerQuery && !`${item.name} ${item.type}`.toLowerCase().includes(playerQuery)) {
          continue;
        }
        const sellPriceCP = shopService.getSellPriceCP(item, this.#merchant);
        const quantity = Math.max(1, Number(item.system?.quantity) || 1);
        playerItems.push({
          id: item.id,
          name: item.name,
          img: item.img || "icons/svg/item-bag.svg",
          type: item.type,
          quantity,
          rarityClass: normalizeRarity(item.system?.rarity ?? item.rarity),
          qtyBadge: itemQtyBadge({ quantity }),
          sellPriceCP,
          sellPriceLabel: shopService.formatPrice(sellPriceCP),
          inOffer: this.#sellOffer.has(item.id)
        });
      }
      playerItems.sort((a, b) => a.name.localeCompare(b.name));
    }

    let buyTotalCP = 0;
    const buyOffer = [];
    for (const [stockId, quantity] of this.#buyOffer) {
      const stock = inventory.find((entry) => entry.id === stockId);
      if (!stock) continue;
      const unit = Math.max(0, Number(stock.priceCP) || 0);
      const line = unit * quantity;
      buyTotalCP += line;
      const maxQty = isUnlimitedStock(stock)
        ? 99
        : Math.max(1, Math.min(99, Number(stock.quantity) || 1));
      buyOffer.push({
        stockId,
        name: stock.name,
        img: stock.img || "icons/svg/item-bag.svg",
        type: stock.type,
        rarityClass: normalizeRarity(stock.rarity),
        quantity,
        maxQty,
        canIncrease: quantity < maxQty,
        canDecrease: quantity > 1,
        linePriceLabel: shopService.formatPrice(line)
      });
    }

    let sellTotalCP = 0;
    const sellOffer = [];
    for (const [itemId, quantity] of this.#sellOffer) {
      const row = playerItems.find((entry) => entry.id === itemId);
      if (!row) continue;
      const line = row.sellPriceCP * quantity;
      sellTotalCP += line;
      sellOffer.push({
        itemId,
        name: row.name,
        img: row.img,
        type: row.type,
        rarityClass: row.rarityClass,
        quantity,
        maxQty: row.quantity,
        canIncrease: quantity < row.quantity,
        canDecrease: quantity > 1,
        linePriceLabel: shopService.formatPrice(line)
      });
    }

    const netCP = buyTotalCP - sellTotalCP;
    const hasOffer = buyOffer.length > 0 || sellOffer.length > 0;
    const canAfford = netCP <= 0 || wallet.walletCP >= netCP;
    let tradeBlocked = "";
    if (isGM) {
      tradeBlocked = "";
    } else if (!buyerActor) {
      tradeBlocked = buyers.length > 1 ? "Choose which character is trading." : "No owned character available.";
    } else if (hasOffer && !canAfford) {
      tradeBlocked = "Not enough gold for this trade.";
    } else if (this.#busy) {
      tradeBlocked = "Trade in progress…";
    }

    const canConfirm = !isGM && hasOffer && canAfford && Boolean(buyerActor) && !this.#busy;

    let netLabel = "Net";
    let netAmountLabel = "Even";
    if (netCP > 0) {
      netLabel = "You pay";
      netAmountLabel = shopService.formatPrice(netCP);
    } else if (netCP < 0) {
      netLabel = "You receive";
      netAmountLabel = shopService.formatPrice(-netCP);
    }

    return Object.assign(context, {
      merchantName: this.#merchant.name,
      merchantImg: this.#merchant.img || "icons/svg/mystery-man.svg",
      merchantGreeting: this.#merchantGreeting(),
      shopName: shop.shopName || `${this.#merchant.name}'s Shop`,
      shopTypeLabel: getShopTypeLabel(shop.shopType),
      query: this.#query,
      playerQuery: this.#playerQuery,
      filter: this.#filter,
      filters,
      priceFilter: this.#priceFilter,
      priceFilters,
      items,
      itemCount: items.length,
      playerItems,
      buyers,
      buyerUuid: this.#buyerUuid,
      hasBuyer: Boolean(this.#buyerUuid),
      needsBuyerChoice: !isGM && this.#buyerPromptNeeded && buyers.length > 1 && !this.#buyerUuid,
      noCharacters: !isGM && buyers.length === 0,
      walletPrimary: wallet.walletPrimary,
      walletCoins: wallet.walletCoins,
      buyOffer,
      sellOffer,
      buyTotalLabel: shopService.formatPrice(buyTotalCP),
      sellTotalLabel: shopService.formatPrice(sellTotalCP),
      netLabel,
      netAmountLabel,
      netPositive: netCP > 0,
      netNegative: netCP < 0,
      hasOffer,
      canConfirm,
      tradeBlocked,
      isGM
    });
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.#applyOpenSize();
  }

  /**
   * Always open large. Saved 840×560 / 1180×700 positions would otherwise
   * keep shrinking the window on every reopen.
   */
  #applyOpenSize() {
    const margin = 48;
    const width = Math.min(MERCHANT_OPEN_WIDTH, Math.max(900, window.innerWidth - margin));
    const height = Math.min(MERCHANT_OPEN_HEIGHT, Math.max(640, window.innerHeight - margin));
    this.setPosition?.({ width, height });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#bindItemHover();

    const search = this.element.querySelector("[data-townforge-merchant-search]");
    if (search && !search.dataset.bound) {
      search.dataset.bound = "1";
      search.addEventListener("input", (event) => {
        this.#query = event.currentTarget.value ?? "";
        void this.render({ force: false });
      });
    }

    const playerSearch = this.element.querySelector("[data-townforge-player-search]");
    if (playerSearch && !playerSearch.dataset.bound) {
      playerSearch.dataset.bound = "1";
      playerSearch.addEventListener("input", (event) => {
        this.#playerQuery = event.currentTarget.value ?? "";
        void this.render({ force: false });
      });
    }

    const buyerSelect = this.element.querySelector("[data-townforge-buyer]");
    if (buyerSelect && !buyerSelect.dataset.bound) {
      buyerSelect.dataset.bound = "1";
      buyerSelect.addEventListener("change", (event) => {
        this.#buyerUuid = event.currentTarget.value || null;
        this.#buyerPromptNeeded = false;
        this.#sellOffer.clear();
        void this.render({ force: false });
      });
    }

    if (game.user.isGM) {
      this.#bindMerchantDropZone();
    }
  }

  #bindMerchantDropZone() {
    const zone = this.element?.querySelector?.("[data-townforge-merchant-drop]");
    if (!zone) return;
    bindItemDropZone(zone, (event) => {
      void this.#handleMerchantItemDrop(event);
    });
  }

  async #handleMerchantItemDrop(event) {
    try {
      const uuid = parseDroppedItemUuid(event);
      if (!uuid) {
        ui.notifications?.warn("Drop an Item from a compendium or the Items sidebar.");
        return;
      }
      await shopService.addManualItem(this.#merchant, uuid);
      ui.notifications?.info("Added item to shop stock.");
      await this.render({ force: false });
    } catch (error) {
      console.error(`${LOG_PREFIX} Merchant item drop failed`, error);
      ui.notifications?.error("Could not add that item to the shop.");
    }
  }

  #bindItemHover() {
    const root = this.element;
    if (!root || root.dataset.itemHoverBound) return;
    root.dataset.itemHoverBound = "1";
    root.addEventListener("pointerover", (event) => {
      const cell = event.target.closest("[data-townforge-item-cell]");
      if (!cell || !root.contains(cell)) return;
      if (event.relatedTarget instanceof Node && cell.contains(event.relatedTarget)) return;
      void this.#showItemTip(cell);
    });
    root.addEventListener("pointerout", (event) => {
      const cell = event.target.closest("[data-townforge-item-cell]");
      if (!cell) return;
      if (event.relatedTarget instanceof Node && cell.contains(event.relatedTarget)) return;
      this.#hideItemTip();
    });
    root.addEventListener("focusin", (event) => {
      const cell = event.target.closest("[data-townforge-item-cell]");
      if (cell) void this.#showItemTip(cell);
    });
    root.addEventListener("focusout", (event) => {
      const cell = event.target.closest("[data-townforge-item-cell]");
      if (!cell) return;
      if (event.relatedTarget instanceof Node && cell.contains(event.relatedTarget)) return;
      this.#hideItemTip();
    });
    root.addEventListener(
      "scroll",
      (event) => {
        if (event.target?.closest?.(".townforge-trade-list, .townforge-trade-offer-scroll")) {
          this.#hideItemTip();
        }
      },
      true
    );
  }

  #hideItemTip() {
    this.#hoverSeq += 1;
    const tip = this.element?.querySelector("[data-townforge-item-tip]");
    if (!tip) return;
    tip.classList.remove("is-open");
    tip.setAttribute("aria-hidden", "true");
  }

  async #showItemTip(cell) {
    const tip = this.element?.querySelector("[data-townforge-item-tip]");
    if (!tip || !cell) return;
    const seq = ++this.#hoverSeq;
    const kind = cell.dataset.kind || "";
    const priceKind = kind === "player" || kind === "offer-sell" ? "Sell" : "Buy";
    this.#fillItemTip(tip, {
      name: cell.dataset.name || "",
      img: cell.dataset.img || "",
      type: cell.dataset.type || "",
      rarity: cell.dataset.rarity || "common",
      qtyLabel: cell.dataset.qty || "",
      priceLabel: cell.dataset.price ? `${priceKind} ${cell.dataset.price}` : "",
      properties: [],
      description: ""
    });
    this.#positionItemTip(tip, cell);
    tip.classList.add("is-open");
    tip.setAttribute("aria-hidden", "false");

    const detail = await this.#detailForCell(cell);
    if (seq !== this.#hoverSeq) return;
    this.#fillItemTip(tip, detail);
    this.#positionItemTip(tip, cell);
    if (detail.rarity) {
      for (const cls of [...cell.classList]) {
        if (cls.startsWith("rarity-")) cell.classList.remove(cls);
      }
      cell.classList.add(`rarity-${detail.rarity}`);
    }
  }

  #fillItemTip(tip, data) {
    const img = tip.querySelector("[data-tip-img]");
    if (img) {
      img.src = data.img || "icons/svg/item-bag.svg";
      img.alt = "";
    }
    const name = tip.querySelector("[data-tip-name]");
    if (name) name.textContent = data.name || "";
    const meta = tip.querySelector("[data-tip-meta]");
    if (meta) {
      meta.textContent = [data.type, rarityLabel(data.rarity), data.qtyLabel ? `Qty ${data.qtyLabel}` : ""]
        .filter(Boolean)
        .join(" · ");
    }
    const price = tip.querySelector("[data-tip-price]");
    if (price) price.textContent = data.priceLabel || "";
    const desc = tip.querySelector("[data-tip-desc]");
    if (desc) {
      desc.textContent = data.description || "";
      desc.hidden = !data.description;
    }
    const props = tip.querySelector("[data-tip-props]");
    if (props) {
      props.replaceChildren();
      for (const entry of data.properties ?? []) {
        const li = document.createElement("li");
        li.textContent = String(entry);
        props.append(li);
      }
      props.hidden = !(data.properties ?? []).length;
    }
  }

  #positionItemTip(tip, cell) {
    const rect = cell.getBoundingClientRect();
    const width = tip.offsetWidth || 300;
    const height = tip.offsetHeight || 160;
    let left = rect.right + 10;
    let top = rect.top;
    if (left + width > window.innerWidth - 8) left = rect.left - width - 10;
    if (left < 8) left = 8;
    if (top + height > window.innerHeight - 8) top = window.innerHeight - height - 8;
    if (top < 8) top = 8;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  async #detailForCell(cell) {
    const kind = cell.dataset.kind || "";
    const priceKind = kind === "player" || kind === "offer-sell" ? "Sell" : "Buy";
    if (kind === "stock" || kind === "offer-buy") {
      const stock = shopService
        .getDisplayInventory(this.#merchant)
        .find((entry) => entry.id === cell.dataset.stockId);
      const detail = await shopService.getStockDetail(stock ?? { uuid: "", rarity: cell.dataset.rarity });
      return {
        name: stock?.name ?? cell.dataset.name ?? "",
        img: stock?.img || cell.dataset.img || "",
        type: stock?.type || cell.dataset.type || "",
        rarity: detail.rarity || cell.dataset.rarity || "common",
        qtyLabel: stock ? stockQuantityLabel(stock) : cell.dataset.qty || "",
        priceLabel: stock?.priceLabel ? `${priceKind} ${stock.priceLabel}` : cell.dataset.price || "",
        properties: detail.properties,
        description: detail.description
      };
    }

    const buyer = this.#buyerUuid ? await fromUuid(this.#buyerUuid) : null;
    const item = buyer?.items?.get?.(cell.dataset.itemId);
    const inspected = shopService.inspectItem(item);
    const sellPriceCP = item ? shopService.getSellPriceCP(item, this.#merchant) : 0;
    return {
      name: item?.name ?? cell.dataset.name ?? "",
      img: item?.img || cell.dataset.img || "",
      type: item?.type || cell.dataset.type || "",
      rarity: inspected.rarity,
      qtyLabel: item ? String(Math.max(1, Number(item.system?.quantity) || 1)) : cell.dataset.qty || "",
      priceLabel: item ? `${priceKind} ${shopService.formatPrice(sellPriceCP)}` : cell.dataset.price || "",
      properties: inspected.properties,
      description: inspected.description
    };
  }

  #ownedCharacters() {
    if (game.user?.isGM) return [];
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
  static async #onSetPriceFilter(_event, target) {
    const filter = target.dataset.priceFilter;
    if (!filter || filter === this.#priceFilter) return;
    this.#priceFilter = filter;
    await this.render({ force: false });
  }

  /** @this {MerchantApp} */
  static async #onToggleBuy(_event, target) {
    if (game.user?.isGM) return;
    const stockId = target.dataset.stockId;
    if (!stockId || target.classList.contains("is-sold-out")) return;
    if (this.#buyOffer.has(stockId)) {
      this.#buyOffer.delete(stockId);
    } else {
      this.#buyOffer.set(stockId, 1);
    }
    await this.render({ force: false });
  }

  /** @this {MerchantApp} */
  static async #onToggleSell(_event, target) {
    if (game.user?.isGM) return;
    const itemId = target.dataset.itemId;
    if (!itemId) return;
    if (this.#sellOffer.has(itemId)) {
      this.#sellOffer.delete(itemId);
    } else {
      this.#sellOffer.set(itemId, 1);
    }
    await this.render({ force: false });
  }

  /** @this {MerchantApp} */
  static async #onRemoveBuy(_event, target) {
    _event.stopPropagation?.();
    const stockId = target.dataset.stockId;
    if (!stockId) return;
    this.#buyOffer.delete(stockId);
    await this.render({ force: false });
  }

  /** @this {MerchantApp} */
  static async #onRemoveSell(_event, target) {
    _event.stopPropagation?.();
    const itemId = target.dataset.itemId;
    if (!itemId) return;
    this.#sellOffer.delete(itemId);
    await this.render({ force: false });
  }

  /** @this {MerchantApp} */
  static async #onAdjustBuyQty(_event, target) {
    _event.stopPropagation?.();
    const stockId = target.dataset.stockId;
    const delta = Number(target.dataset.delta) || 0;
    if (!stockId || !delta) return;
    const current = this.#buyOffer.get(stockId);
    if (current == null) return;
    const shop = shopService.getShopkeeper(this.#merchant);
    const stock = (shop.inventory ?? []).find((entry) => entry.id === stockId);
    const maxQty = isUnlimitedStock(stock)
      ? 99
      : Math.max(1, Math.min(99, Number(stock?.quantity) || 1));
    const next = Math.max(1, Math.min(maxQty, current + delta));
    this.#buyOffer.set(stockId, next);
    await this.render({ force: false });
  }

  /** @this {MerchantApp} */
  static async #onAdjustSellQty(_event, target) {
    _event.stopPropagation?.();
    const itemId = target.dataset.itemId;
    const delta = Number(target.dataset.delta) || 0;
    if (!itemId || !delta) return;
    const current = this.#sellOffer.get(itemId);
    if (current == null) return;
    const buyer = this.#buyerUuid ? await fromUuid(this.#buyerUuid) : null;
    const item = buyer?.items?.get?.(itemId);
    const maxQty = Math.max(1, Math.min(99, Number(item?.system?.quantity) || 1));
    const next = Math.max(1, Math.min(maxQty, current + delta));
    this.#sellOffer.set(itemId, next);
    await this.render({ force: false });
  }

  /** @this {MerchantApp} */
  static async #onClearOffer() {
    this.#buyOffer.clear();
    this.#sellOffer.clear();
    await this.render({ force: false });
  }

  /** @this {MerchantApp} */
  static async #onConfigureShop() {
    if (!game.user.isGM) return;
    const { ShopkeeperConfig } = await import("./shopkeeper-config.js");
    await ShopkeeperConfig.show(this.#merchant);
  }

  /** @this {MerchantApp} */
  static async #onConfirmTrade(event, target) {
    event.preventDefault();
    event.stopPropagation?.();
    if (this.#busy) return;
    if (game.user?.isGM) return;

    const buyers = this.#ownedCharacters();
    if (!buyers.length) {
      ui.notifications?.warn("No owned character available for trading.");
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

    if (!this.#buyOffer.size && !this.#sellOffer.size) return;

    this.#busy = true;
    if (target) target.disabled = true;
    await this.render({ force: false });

    try {
      const result = await shopService.executeTrade({
        merchantUuid: this.#merchant.uuid,
        buyerUuid,
        buys: [...this.#buyOffer.entries()].map(([stockId, quantity]) => ({ stockId, quantity })),
        sells: [...this.#sellOffer.entries()].map(([itemId, quantity]) => ({ itemId, quantity }))
      });

      if (!result.ok) {
        ui.notifications?.warn(result.message || "Trade failed.");
        return;
      }

      ui.notifications?.info(result.message || "Trade complete.");
      this.#buyOffer.clear();
      this.#sellOffer.clear();
    } catch (error) {
      console.error(`${LOG_PREFIX} Trade failed`, error);
      ui.notifications?.error("Trade failed.");
    } finally {
      this.#busy = false;
      await this.render({ force: false });
    }
  }
}
