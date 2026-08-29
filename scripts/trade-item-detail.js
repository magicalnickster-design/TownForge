import { rarityLabel, stockQuantityLabel } from "./shop-constants.js";
import { shopService } from "./shop-service.js";

/**
 * Load full item detail for a trade window cell (stock, offer, or player inventory).
 * @param {Actor} merchant
 * @param {string|null} buyerUuid
 * @param {HTMLElement} cell
 */
export async function loadTradeItemDetail(merchant, buyerUuid, cell) {
  const kind = cell.dataset.kind || "";
  const priceKind = kind === "player" || kind === "offer-sell" ? "Sell" : "Buy";

  if (kind === "stock" || kind === "offer-buy") {
    const stock = shopService
      .getDisplayInventory(merchant)
      .find((entry) => entry.id === cell.dataset.stockId);
    const detail = await shopService.getStockDetail(stock ?? { uuid: "", rarity: cell.dataset.rarity });
    return {
      name: stock?.name ?? cell.dataset.name ?? "",
      img: stock?.img || cell.dataset.img || "",
      type: stock?.type || cell.dataset.type || "",
      rarity: detail.rarity || cell.dataset.rarity || "common",
      qtyLabel: stock ? stockQuantityLabel(stock) : cell.dataset.qty || "",
      priceLabel: stock?.priceLabel ? `${priceKind} ${stock.priceLabel}` : cell.dataset.price || "",
      properties: detail.properties ?? [],
      description: detail.description ?? ""
    };
  }

  const buyer = buyerUuid ? await fromUuid(buyerUuid) : null;
  const item = buyer?.items?.get?.(cell.dataset.itemId);
  const inspected = shopService.inspectItem(item);
  const sellPriceCP = item ? shopService.getSellPriceCP(item, merchant) : 0;
  return {
    name: item?.name ?? cell.dataset.name ?? "",
    img: item?.img || cell.dataset.img || "",
    type: item?.type || cell.dataset.type || "",
    rarity: inspected.rarity,
    qtyLabel: item ? String(Math.max(1, Number(item.system?.quantity) || 1)) : cell.dataset.qty || "",
    priceLabel: item ? `${priceKind} ${shopService.formatPrice(sellPriceCP)}` : cell.dataset.price || "",
    properties: inspected.properties ?? [],
    description: inspected.description ?? ""
  };
}

/**
 * @param {Awaited<ReturnType<typeof loadTradeItemDetail>>} detail
 */
export function formatTradeItemMeta(detail) {
  return [detail.type, rarityLabel(detail.rarity), detail.qtyLabel ? `Qty ${detail.qtyLabel}` : ""]
    .filter(Boolean)
    .join(" · ");
}
