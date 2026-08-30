import { MODULE_ID } from "./constants.js";
import { getHandlebarsApplicationV2Base } from "./app-api.js";
import { formatTradeItemMeta, loadTradeItemDetail } from "./trade-item-detail.js";

const HandlebarsApplicationV2 = getHandlebarsApplicationV2Base();

const INSPECT_WINDOW_WIDTH = 1260;
const INSPECT_WINDOW_HEIGHT = 960;
const INSPECT_WINDOW_MARGIN = 16;

/**
 * Centered inspect window size, clamped to the current viewport.
 * @param {number} [width]
 * @param {number} [height]
 */
function centerInspectPosition(width = INSPECT_WINDOW_WIDTH, height = INSPECT_WINDOW_HEIGHT) {
  const w = Math.min(width, window.innerWidth - INSPECT_WINDOW_MARGIN * 2);
  const h = Math.min(height, window.innerHeight - INSPECT_WINDOW_MARGIN * 2);
  return {
    width: w,
    height: h,
    left: Math.max(INSPECT_WINDOW_MARGIN, Math.round((window.innerWidth - w) / 2)),
    top: Math.max(INSPECT_WINDOW_MARGIN, Math.round((window.innerHeight - h) / 2))
  };
}

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
    position: centerInspectPosition(),
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
   *   cell: HTMLElement
   * }} options
   */
  static async show(options) {
    const existing = foundry.applications.instances.get("townforge-trade-item-inspect");
    if (existing) await existing.close({ animate: false });

    const detail = await loadTradeItemDetail(options.merchant, options.buyerUuid ?? null, options.cell);
    const app = new TradeItemInspect({ ...options, detail });
    await app.render({
      force: true,
      position: centerInspectPosition()
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
