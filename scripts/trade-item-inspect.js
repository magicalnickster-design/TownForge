import { MODULE_ID } from "./constants.js";
import { getHandlebarsApplicationV2Base } from "./app-api.js";
import { formatTradeItemMeta, loadTradeItemDetail } from "./trade-item-detail.js";

const HandlebarsApplicationV2 = getHandlebarsApplicationV2Base();

const INSPECT_WINDOW_WIDTH = 1260;
const INSPECT_WINDOW_HEIGHT = 960;

/** Right-click item inspector — scrollable description in a separate window. */
export class TradeItemInspect extends HandlebarsApplicationV2 {
  /** @type {Actor} */
  #merchant;

  /** @type {string|null} */
  #buyerUuid = null;

  /** @type {HTMLElement} */
  #cell;

  /** @type {Awaited<ReturnType<typeof loadTradeItemDetail>>|null} */
  #detail = null;

  static DEFAULT_OPTIONS = {
    id: "townforge-trade-item-inspect",
    classes: ["townforge", "townforge-trade-item-inspect"],
    tag: "div",
    window: {
      title: "Item Details",
      resizable: true,
      contentClasses: ["townforge-window-content"]
    },
    position: { width: INSPECT_WINDOW_WIDTH, height: INSPECT_WINDOW_HEIGHT },
    actions: {
      closeInspect: TradeItemInspect.#onClose
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/shop/trade-item-inspect.hbs`,
      scrollable: [".townforge-item-inspect-desc"]
    }
  };

  /**
   * @param {{
   *   merchant: Actor,
   *   buyerUuid?: string|null,
   *   cell: HTMLElement,
   *   detail: Awaited<ReturnType<typeof loadTradeItemDetail>>
   * }} options
   */
  constructor(options = {}) {
    super(options);
    this.#merchant = options.merchant;
    this.#buyerUuid = options.buyerUuid ?? null;
    this.#cell = options.cell;
    this.#detail = options.detail ?? null;
    this.options.window.title = this.#detail?.name || "Item Details";
  }

  /**
   * @param {{
   *   merchant: Actor,
   *   buyerUuid?: string|null,
   *   cell: HTMLElement,
   *   left?: number,
   *   top?: number
   * }} options
   */
  static async show(options) {
    const existing = foundry.applications.instances.get("townforge-trade-item-inspect");
    if (existing) await existing.close({ animate: false });

    const detail = await loadTradeItemDetail(options.merchant, options.buyerUuid ?? null, options.cell);
    const app = new TradeItemInspect({ ...options, detail });
    const margin = 16;
    const width = INSPECT_WINDOW_WIDTH;
    const height = INSPECT_WINDOW_HEIGHT;
    const left =
      typeof options.left === "number"
        ? Math.min(Math.max(margin, options.left), Math.max(margin, window.innerWidth - width - margin))
        : undefined;
    const top =
      typeof options.top === "number"
        ? Math.min(Math.max(margin, options.top), Math.max(margin, window.innerHeight - height - margin))
        : undefined;
    await app.render({
      force: true,
      position: left != null && top != null ? { width, height, left, top } : { width, height }
    });
    return app;
  }

  /** @inheritDoc */
  async _prepareContext(_options) {
    const detail = this.#detail ?? {
      name: this.#cell?.dataset?.name ?? "",
      img: this.#cell?.dataset?.img || "icons/svg/item-bag.svg",
      type: this.#cell?.dataset?.type ?? "",
      rarity: this.#cell?.dataset?.rarity ?? "common",
      qtyLabel: this.#cell?.dataset?.qty ?? "",
      priceLabel: this.#cell?.dataset?.price ?? "",
      properties: [],
      description: ""
    };
    return {
      name: detail.name,
      img: detail.img || "icons/svg/item-bag.svg",
      meta: formatTradeItemMeta(detail),
      priceLabel: detail.priceLabel,
      properties: detail.properties ?? [],
      hasProperties: (detail.properties ?? []).length > 0,
      description: detail.description ?? "",
      hasDescription: Boolean(detail.description)
    };
  }

  /** @this {TradeItemInspect} */
  static async #onClose(_event, _target) {
    await this.close({ animate: false });
  }
}
