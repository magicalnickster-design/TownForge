import { LOG_PREFIX } from "./constants.js";

/**
 * Resolve Foundry's ApplicationV2 API with a clear error if unavailable.
 * @returns {typeof foundry.applications.api}
 */
export function getFoundryAppApi() {
  const api = globalThis.foundry?.applications?.api;
  if (!api?.ApplicationV2 || !api?.HandlebarsApplicationMixin) {
    throw new Error(`${LOG_PREFIX} Foundry ApplicationV2 API is unavailable.`);
  }
  return api;
}

/**
 * @returns {typeof import("foundry").applications.api.ApplicationV2}
 */
export function getApplicationV2() {
  return getFoundryAppApi().ApplicationV2;
}

/**
 * @param {typeof import("foundry").applications.api.ApplicationV2} Base
 * @returns {typeof import("foundry").applications.api.ApplicationV2}
 */
export function mixHandlebarsApplication(Base) {
  return getFoundryAppApi().HandlebarsApplicationMixin(Base);
}
