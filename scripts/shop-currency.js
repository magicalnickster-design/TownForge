/**
 * Pure currency helpers for TownForge shop purchases.
 * No Foundry dependency — safe for Node unit tests.
 */

export const COIN_CP = Object.freeze({
  pp: 1000,
  gp: 100,
  ep: 50,
  sp: 10,
  cp: 1
});

export const COIN_ORDER = Object.freeze(["pp", "gp", "ep", "sp", "cp"]);

/**
 * @param {object} currency
 * @returns {number}
 */
export function currencyToCopper(currency = {}) {
  return COIN_ORDER.reduce((sum, denom) => {
    return sum + (Math.max(0, Number(currency[denom]) || 0) * COIN_CP[denom]);
  }, 0);
}

/**
 * Normalize a currency object to non-negative integer coin counts.
 * @param {object} currency
 * @returns {{pp:number,gp:number,ep:number,sp:number,cp:number}}
 */
export function normalizeCurrency(currency = {}) {
  const next = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  for (const denom of COIN_ORDER) {
    next[denom] = Math.max(0, Math.floor(Number(currency[denom]) || 0));
  }
  return next;
}

/**
 * Format copper as a compact human label (e.g. "15 gp" or "74 gp, 8 sp").
 * @param {number} priceCP
 * @returns {string}
 */
export function formatCopper(priceCP) {
  let remaining = Math.max(0, Math.floor(Number(priceCP) || 0));
  const parts = [];
  for (const denom of COIN_ORDER) {
    const value = COIN_CP[denom];
    const count = Math.floor(remaining / value);
    if (count > 0) {
      parts.push(`${count} ${denom}`);
      remaining -= count * value;
    }
  }
  return parts.length ? parts.join(", ") : "0 cp";
}

/**
 * Format a wallet object for display.
 * @param {object} currency
 * @returns {string}
 */
export function formatWallet(currency = {}) {
  const normalized = normalizeCurrency(currency);
  const parts = [];
  for (const denom of COIN_ORDER) {
    if (normalized[denom] > 0) parts.push(`${normalized[denom]} ${denom}`);
  }
  return parts.length ? parts.join(", ") : "0 cp";
}

/**
 * Deduct a copper-equivalent price while preserving denominations.
 *
 * Strategy:
 * 1. Pay exactly using available coins from largest → smallest without overpaying.
 * 2. If a remainder remains, break the smallest larger coin that can cover it and
 *    return change in smaller denominations.
 * 3. Never produce negative coin counts. Never rewrite the whole wallet into copper.
 *
 * @param {object} currency
 * @param {number} priceCP
 * @returns {{pp:number,gp:number,ep:number,sp:number,cp:number}}
 */
export function deductCopper(currency, priceCP) {
  const cost = Math.max(0, Math.floor(Number(priceCP) || 0));
  const wallet = normalizeCurrency(currency);
  const total = currencyToCopper(wallet);
  if (total < cost) throw new Error("Insufficient funds");
  if (cost === 0) return wallet;

  let remaining = cost;

  // Phase 1: spend exact coins without exceeding the remaining cost.
  for (const denom of COIN_ORDER) {
    const value = COIN_CP[denom];
    if (!wallet[denom] || remaining <= 0) continue;
    const canUse = Math.min(wallet[denom], Math.floor(remaining / value));
    if (canUse > 0) {
      wallet[denom] -= canUse;
      remaining -= canUse * value;
    }
  }

  if (remaining === 0) return wallet;

  // Phase 2: break the smallest denomination coin that is larger than the remainder.
  const breakOrder = ["cp", "sp", "ep", "gp", "pp"];
  for (const denom of breakOrder) {
    const value = COIN_CP[denom];
    if (wallet[denom] <= 0) continue;
    if (value < remaining) continue;

    wallet[denom] -= 1;
    const change = value - remaining;
    remaining = 0;
    addChange(wallet, change, denom);
    break;
  }

  if (remaining > 0) {
    // Fallback: convert from any larger remaining coins (should be rare).
    for (const denom of COIN_ORDER) {
      const value = COIN_CP[denom];
      while (wallet[denom] > 0 && remaining > 0) {
        wallet[denom] -= 1;
        if (value >= remaining) {
          addChange(wallet, value - remaining, denom);
          remaining = 0;
          break;
        }
        remaining -= value;
      }
      if (remaining === 0) break;
    }
  }

  if (remaining > 0) throw new Error("Insufficient funds");
  return wallet;
}

/**
 * Add copper change into denominations strictly smaller than `brokenDenom`.
 * Prefers common coins (gp/sp/cp) and avoids electrum unless required.
 * @param {object} wallet
 * @param {number} changeCP
 * @param {string} brokenDenom
 */
function addChange(wallet, changeCP, brokenDenom) {
  let remaining = Math.max(0, Math.floor(changeCP));
  const brokenIndex = COIN_ORDER.indexOf(brokenDenom);
  const smaller = brokenIndex >= 0 ? COIN_ORDER.slice(brokenIndex + 1) : COIN_ORDER.slice();
  // Prefer mundane purse denominations when making change.
  const preferred = ["gp", "sp", "cp"];
  const ladder = [
    ...preferred.filter((denom) => smaller.includes(denom)),
    ...smaller.filter((denom) => !preferred.includes(denom))
  ];

  for (const denom of ladder) {
    const value = COIN_CP[denom];
    const count = Math.floor(remaining / value);
    if (count > 0) {
      wallet[denom] += count;
      remaining -= count * value;
    }
  }
  if (remaining > 0) wallet.cp += remaining;
}

/**
 * Add copper-equivalent value into a wallet as whole coins (largest first).
 * @param {object} currency
 * @param {number} amountCP
 * @returns {{pp:number,gp:number,ep:number,sp:number,cp:number}}
 */
export function addCopper(currency, amountCP) {
  const wallet = normalizeCurrency(currency);
  let remaining = Math.max(0, Math.floor(Number(amountCP) || 0));
  for (const denom of COIN_ORDER) {
    const value = COIN_CP[denom];
    const count = Math.floor(remaining / value);
    if (count > 0) {
      wallet[denom] += count;
      remaining -= count * value;
    }
  }
  return wallet;
}

/**
 * Merchant buyback rate (fraction of item value paid to the player).
 */
export const SELL_PRICE_RATIO = 0.5;

/**
 * Lightweight purchase validation used by ShopService and unit tests.
 * Does not mutate state and ignores client-provided price/uuid overrides.
 *
 * @param {object} args
 * @returns {{ok:boolean, message?:string, priceCP?:number, unitPriceCP?:number, quantity?:number, stock?:object}}
 */
export function validatePurchaseRequest({
  shop,
  stockId,
  buyerOwned,
  buyerType,
  buyerCurrency,
  clientPriceCP = null,
  clientUuid = null,
  quantity = 1
}) {
  if (!shop?.enabled) {
    return { ok: false, message: "Shop unavailable." };
  }
  if (!buyerOwned) {
    return { ok: false, message: "Character not selected." };
  }
  if (buyerType && buyerType !== "character") {
    return { ok: false, message: "Character not selected." };
  }

  const stock = (shop.inventory ?? []).find((entry) => entry?.id === stockId);
  if (!stock) {
    return { ok: false, message: "Item unavailable." };
  }

  const qty = Math.max(1, Math.min(99, Math.floor(Number(quantity) || 1)));
  const unlimited =
    stock.unlimited === true || stock.quantity == null || Number(stock.quantity) < 0;
  if (!unlimited && Number(stock.quantity) <= 0) {
    return { ok: false, message: "Item sold out." };
  }
  if (!unlimited && Number(stock.quantity) < qty) {
    return { ok: false, message: "Not enough stock." };
  }

  // Authoritative price/uuid always come from stock — ignore client tampering.
  void clientPriceCP;
  void clientUuid;
  const unitPriceCP = Math.max(0, Number(stock.priceCP) || 0);
  if (!unitPriceCP) {
    return { ok: false, message: "Item unavailable." };
  }
  const priceCP = unitPriceCP * qty;

  const totalCP = currencyToCopper(buyerCurrency);
  if (totalCP < priceCP) {
    return { ok: false, message: "Not enough gold." };
  }

  return { ok: true, priceCP, unitPriceCP, quantity: qty, stock };
}
