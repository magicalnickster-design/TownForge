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
