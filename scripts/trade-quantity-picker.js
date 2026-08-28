import { MODULE_ID } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** BG3-style quantity picker for selling stacked items. */
export class TradeQuantityPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {string} */
  #name = "";

  /** @type {string} */
  #img = "";

  /** @type {string} */
  #type = "";

  /** @type {number} */
  #maxQuantity = 1;

  /** @type {number} */
  #quantity = 1;

  /** @type {number} */
  #unitPriceCP = 0;

  /** @type {(cp: number) => string} */
  #formatPrice = (cp) => String(cp);

  /** @type {((value: number|null) => void)|null} */
  #onResolve = null;

  /** @type {boolean} */
  #resolved = false;

  static DEFAULT_OPTIONS = {
    id: "townforge-trade-qty-picker",
    classes: ["townforge", "townforge-trade-qty-picker"],
    tag: "div",
    window: {
      title: "Sell Item",
      resizable: false,
      contentClasses: ["townforge-window-content"]
    },
    position: { width: 420, height: "auto" },
    actions: {
      confirm: TradeQuantityPicker.#onConfirm,
      cancel: TradeQuantityPicker.#onCancel,
      decrease: TradeQuantityPicker.#onDecrease,
      increase: TradeQuantityPicker.#onIncrease
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/shop/trade-quantity-picker.hbs`
    }
  };

  /**
   * @param {{
   *   name: string,
   *   img?: string,
   *   type?: string,
   *   maxQuantity: number,
   *   unitPriceCP: number,
   *   formatPrice?: (cp: number) => string,
   *   onResolve: (value: number|null) => void
   * }} options
   */
  constructor(options = {}) {
    super(options);
    this.#name = options.name ?? "Item";
    this.#img = options.img || "icons/svg/item-bag.svg";
    this.#type = options.type ?? "";
    this.#maxQuantity = Math.max(1, Math.floor(Number(options.maxQuantity) || 1));
    this.#quantity = 1;
    this.#unitPriceCP = Math.max(0, Number(options.unitPriceCP) || 0);
    this.#formatPrice = options.formatPrice ?? ((cp) => String(cp));
    this.#onResolve = options.onResolve ?? null;
  }

  /**
   * @param {Omit<ConstructorParameters<typeof TradeQuantityPicker>[0], "onResolve">} options
   * @returns {Promise<number|null>}
   */
  static prompt(options) {
    const existing = foundry.applications.instances.get("townforge-trade-qty-picker");
    if (existing) existing.close();

    return new Promise((resolve) => {
      const app = new TradeQuantityPicker({ ...options, onResolve: resolve });
      void app.render({ force: true });
    });
  }

  /** @inheritDoc */
  async _prepareContext(_options) {
    return {
      name: this.#name,
      img: this.#img,
      type: this.#type,
      maxQuantity: this.#maxQuantity,
      quantity: this.#quantity,
      linePriceLabel: this.#formatPrice(this.#unitPriceCP * this.#quantity)
    };
  }

  _onRender(_context, _options) {
    super._onRender?.(_context, _options);
    const slider = this.element?.querySelector?.("[data-townforge-qty-slider]");
    if (!slider || slider.dataset.bound === "1") return;
    slider.dataset.bound = "1";
    slider.addEventListener("input", (event) => {
      this.#setQuantity(Number(event.currentTarget.value) || 1, false);
    });
  }

  #setQuantity(next, rerender = true) {
    this.#quantity = Math.max(1, Math.min(this.#maxQuantity, Math.floor(Number(next) || 1)));
    const display = this.element?.querySelector?.("[data-townforge-qty-display]");
    const price = this.element?.querySelector?.("[data-townforge-qty-price]");
    const slider = this.element?.querySelector?.("[data-townforge-qty-slider]");
    if (display) display.textContent = String(this.#quantity);
    if (price) price.textContent = this.#formatPrice(this.#unitPriceCP * this.#quantity);
    if (slider) slider.value = String(this.#quantity);
    if (rerender) void this.render({ force: false });
  }

  #resolve(value) {
    if (this.#resolved) return;
    this.#resolved = true;
    const callback = this.#onResolve;
    this.#onResolve = null;
    callback?.(value);
  }

  /** @this {TradeQuantityPicker} */
  static async #onConfirm(_event, _target) {
    const quantity = this.#quantity;
    this.#resolve(quantity);
    await this.close({ animate: false });
  }

  /** @this {TradeQuantityPicker} */
  static async #onCancel(_event, _target) {
    this.#resolve(null);
    await this.close({ animate: false });
  }

  /** @this {TradeQuantityPicker} */
  static #onDecrease(_event, _target) {
    this.#setQuantity(this.#quantity - 1, false);
  }

  /** @this {TradeQuantityPicker} */
  static #onIncrease(_event, _target) {
    this.#setQuantity(this.#quantity + 1, false);
  }

  /** @inheritDoc */
  close(options = {}) {
    this.#resolve(null);
    return super.close(options);
  }
}
