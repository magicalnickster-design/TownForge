export const TRADE_DRAG_MIME = "application/x-townforge-trade-item";

/**
 * @typedef {{ kind: "stock", stockId: string } | { kind: "player", itemId: string }} TradeDragPayload
 */

/**
 * @param {DataTransfer|null|undefined} transfer
 * @param {TradeDragPayload} payload
 */
export function setTradeItemDragData(transfer, payload) {
  if (!transfer) return;
  transfer.setData(TRADE_DRAG_MIME, JSON.stringify(payload));
  transfer.effectAllowed = "copy";
}

/**
 * @param {DragEvent} event
 * @returns {TradeDragPayload|null}
 */
export function parseTradeItemDragData(event) {
  const transfer = event.dataTransfer;
  if (!transfer) return null;

  const raw = transfer.getData(TRADE_DRAG_MIME);
  if (!raw) return null;

  try {
    const data = JSON.parse(raw);
    if (data?.kind === "stock" && data.stockId) {
      return { kind: "stock", stockId: String(data.stockId) };
    }
    if (data?.kind === "player" && data.itemId) {
      return { kind: "player", itemId: String(data.itemId) };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {DragEvent} event
 * @returns {boolean}
 */
export function hasTradeItemDrag(event) {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return [...types].includes(TRADE_DRAG_MIME);
}

/**
 * @param {HTMLElement} zone
 * @param {(payload: TradeDragPayload) => void} onDrop
 */
export function bindTradeOfferDropZone(zone, onDrop) {
  if (!zone || zone.dataset.tradeDropBound === "1") return;
  zone.dataset.tradeDropBound = "1";

  zone.addEventListener("dragover", (event) => {
    if (!hasTradeItemDrag(event)) return;
    event.preventDefault();
    zone.classList.add("is-drop-target");
  });
  zone.addEventListener("dragleave", (event) => {
    if (event.currentTarget === event.target || !zone.contains(event.relatedTarget)) {
      zone.classList.remove("is-drop-target");
    }
  });
  zone.addEventListener("drop", (event) => {
    const payload = parseTradeItemDragData(event);
    if (!payload) return;
    event.preventDefault();
    event.stopPropagation();
    zone.classList.remove("is-drop-target");
    onDrop(payload);
  });
}

/**
 * Parse a Foundry Item drag/drop payload (sidebar, compendium, actor sheet).
 * @param {DragEvent} event
 * @returns {string|null} Item UUID
 */
export function parseDroppedItemUuid(event) {
  const transfer = event.dataTransfer;
  if (!transfer) return null;

  const mimeTypes = ["text/plain", "application/json"];
  for (const mime of mimeTypes) {
    const raw = transfer.getData(mime);
    const uuid = parseItemDropText(raw);
    if (uuid) return uuid;
  }
  return null;
}

/**
 * @param {string} raw
 * @returns {string|null}
 */
export function parseItemDropText(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  if (text.startsWith("{")) {
    try {
      const data = JSON.parse(text);
      const uuid = data.uuid || data.data?.uuid;
      if (!uuid) return null;
      if (data.type && data.type !== "Item") return null;
      return String(uuid);
    } catch {
      return null;
    }
  }

  if (/^(Item|Compendium)\./.test(text)) return text;
  return null;
}

/**
 * @param {HTMLElement} zone
 * @param {(event: DragEvent) => void} onDrop
 */
export function bindItemDropZone(zone, onDrop) {
  if (!zone || zone.dataset.dropBound === "1") return;
  zone.dataset.dropBound = "1";

  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("is-drop-target");
  });
  zone.addEventListener("dragleave", (event) => {
    if (event.currentTarget === event.target || !zone.contains(event.relatedTarget)) {
      zone.classList.remove("is-drop-target");
    }
  });
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("is-drop-target");
    onDrop(event);
  });
}
