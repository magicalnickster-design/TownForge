/**
 * Merchant Wares price filter chips.
 * maxCP = show items up to that price; minCP = show items at or above that price.
 */

export const MERCHANT_PRICE_FILTERS = Object.freeze([
  { id: "all", label: "All Prices" },
  { id: "affordable", label: "Affordable" },
  { id: "1gp", label: "Up to 1 gp", maxCP: 100 },
  { id: "10gp", label: "Up to 10 gp", maxCP: 1000 },
  { id: "50gp", label: "Up to 50 gp", maxCP: 5000 },
  { id: "100gp", label: "Up to 100 gp", maxCP: 10000 },
  { id: "500gp", label: "Up to 500 gp", maxCP: 50000 },
  { id: "50gp+", label: "50 gp+", minCP: 5000 },
  { id: "100gp+", label: "100 gp+", minCP: 10000 },
  { id: "500gp+", label: "500 gp+", minCP: 50000 }
]);

/**
 * @param {number} priceCP
 * @param {string} filterId
 * @param {number} [walletCP]
 * @returns {boolean}
 */
export function matchesMerchantPriceFilter(priceCP, filterId, walletCP = 0) {
  const price = Math.max(0, Number(priceCP) || 0);
  const filter = MERCHANT_PRICE_FILTERS.find((row) => row.id === filterId) ?? MERCHANT_PRICE_FILTERS[0];
  if (filter.id === "all") return true;
  if (filter.id === "affordable") return price <= Math.max(0, Number(walletCP) || 0);
  if (filter.maxCP != null && filter.minCP == null) return price <= filter.maxCP;
  if (filter.minCP != null) return price >= filter.minCP;
  return true;
}
