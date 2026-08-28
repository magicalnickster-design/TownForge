/**
 * Helpers for trade quantity prompts.
 */

/**
 * @param {number} totalQuantity
 * @param {number} offeredQty
 * @returns {number}
 */
export function getRemainingSellQuantity(totalQuantity, offeredQty = 0) {
  return Math.max(0, Math.floor(Number(totalQuantity) || 0) - Math.floor(Number(offeredQty) || 0));
}

/**
 * @param {number} remainingQty
 * @returns {boolean}
 */
export function shouldPromptSellQuantity(remainingQty) {
  return getRemainingSellQuantity(remainingQty, 0) > 1;
}

/**
 * @param {number} currentOffered
 * @param {number} addQty
 * @param {number} totalQuantity
 * @returns {number}
 */
export function nextSellOfferQuantity(currentOffered, addQty, totalQuantity) {
  const total = Math.max(1, Math.floor(Number(totalQuantity) || 1));
  const next = Math.floor(Number(currentOffered) || 0) + Math.max(1, Math.floor(Number(addQty) || 1));
  return Math.min(total, next);
}
