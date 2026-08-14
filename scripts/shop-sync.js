import { MODULE_ID } from "./constants.js";
import { SHOPKEEPER_FLAG } from "./shop-constants.js";

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingRefresh = new Map();

/**
 * Detect whether an Actor update payload touched TownForge shopkeeper flags.
 * Handles nested and dotted Foundry change shapes.
 * @param {object|null|undefined} changes
 * @returns {boolean}
 */
export function shopkeeperFlagsChanged(changes) {
  if (!changes || typeof changes !== "object") return false;

  const nested = changes.flags?.[MODULE_ID];
  if (nested && typeof nested === "object" && SHOPKEEPER_FLAG in nested) {
    return true;
  }

  for (const key of Object.keys(changes)) {
    if (
      key === `flags.${MODULE_ID}.${SHOPKEEPER_FLAG}` ||
      key.startsWith(`flags.${MODULE_ID}.${SHOPKEEPER_FLAG}.`)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Detect buyer currency changes that should refresh open shop wallets.
 * @param {object|null|undefined} changes
 * @returns {boolean}
 */
export function buyerCurrencyChanged(changes) {
  if (!changes || typeof changes !== "object") return false;
  if (changes.system?.currency !== undefined) return true;
  for (const key of Object.keys(changes)) {
    if (key === "system.currency" || key.startsWith("system.currency.")) return true;
  }
  return false;
}

/**
 * Re-render open TownForge merchant / shopkeeper windows for a merchant.
 * Debounced so Actor update + socket broadcast do not double-flash the UI.
 * @param {string|Actor|null|undefined} merchantRef Actor id, uuid, or Actor
 * @param {{immediate?: boolean}} [options]
 */
export function refreshOpenShopUIs(merchantRef, options = {}) {
  const keys = merchantRefKeys(merchantRef);
  if (!keys.length) return;

  const debounceKey = keys[0];
  const run = () => {
    pendingRefresh.delete(debounceKey);
    void renderMatchingShopApps(keys);
  };

  if (options.immediate) {
    const existing = pendingRefresh.get(debounceKey);
    if (existing) clearTimeout(existing);
    pendingRefresh.delete(debounceKey);
    run();
    return;
  }

  if (pendingRefresh.has(debounceKey)) return;
  pendingRefresh.set(
    debounceKey,
    setTimeout(run, 50)
  );
}

/**
 * Refresh any open merchant window currently shopping as this buyer.
 * @param {string|Actor|null|undefined} buyerRef
 */
export function refreshOpenShopUIsForBuyer(buyerRef) {
  const buyerKeys = new Set(merchantRefKeys(buyerRef));
  if (!buyerKeys.size) return;

  for (const app of listAppInstances()) {
    if (typeof app?.refreshIfBuyer !== "function") continue;
    if (app.refreshIfBuyer(buyerKeys)) {
      void app.render?.({ force: false });
    }
  }
}

/**
 * @param {string|Actor|null|undefined} merchantRef
 * @returns {string[]}
 */
function merchantRefKeys(merchantRef) {
  if (!merchantRef) return [];
  if (typeof merchantRef === "string") return [merchantRef];
  const keys = [];
  if (merchantRef.id) keys.push(merchantRef.id);
  if (merchantRef.uuid) keys.push(merchantRef.uuid);
  return keys;
}

/**
 * @param {string[]} keys
 */
async function renderMatchingShopApps(keys) {
  const keySet = new Set(keys);
  for (const app of listAppInstances()) {
    if (typeof app?.matchesMerchant !== "function") continue;
    if (!app.matchesMerchant(keySet)) continue;
    try {
      await app.render?.({ force: false });
    } catch (_error) {
      // Ignore closed/teardown races.
    }
  }
}

function listAppInstances() {
  const instances = foundry?.applications?.instances;
  if (!instances) return [];
  return [...instances.values()];
}
