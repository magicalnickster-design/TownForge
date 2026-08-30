import { MODULE_ID } from "../constants.js";

export const PRODUCT_ID = "townforge";
export const DEFAULT_AUTH_API_BASE_URL = "https://gambitsforge.online";
export const ACCOUNT_URL = "https://gambitsforge.online";
export const SETTING_AUTH_API_BASE_URL = "gambitsAuthApiBaseUrl";
export const SETTING_AUTH_SESSION = "gambitsAuthSession";
export const SETTING_ENTITLEMENT_CACHE = "townforgeEntitlementCache";
export const SETTING_WORLD_ACCESS = "townforgeWorldAccess";
export const SETTING_AUTH_DEBUG = "authDebugLogging";
export const MAX_OFFLINE_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_SOFT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const AUTH_STATES = Object.freeze({
  LOADING: "loading",
  SIGNED_OUT: "signed_out",
  EMAIL_UNVERIFIED: "email_unverified",
  SUBSCRIPTION_INACTIVE: "subscription_inactive",
  ENTITLEMENT_DENIED: "entitlement_denied",
  BELOW_TIER: "below_tier",
  BACKEND_OFFLINE: "backend_offline",
  SESSION_EXPIRED: "session_expired",
  ENTITLEMENT_EXPIRED: "entitlement_expired",
  AUTHENTICATED: "authenticated"
});

export function getAuthBaseUrl() {
  try {
    const configured = String(game.settings?.get?.(MODULE_ID, SETTING_AUTH_API_BASE_URL) ?? "").trim();
    return (configured || DEFAULT_AUTH_API_BASE_URL).replace(/\/+$/, "");
  } catch {
    return DEFAULT_AUTH_API_BASE_URL;
  }
}

export function isAuthDebugEnabled() {
  try {
    return Boolean(game.settings?.get?.(MODULE_ID, SETTING_AUTH_DEBUG));
  } catch {
    return false;
  }
}

export function authDebug(...args) {
  if (!isAuthDebugEnabled()) return;
  console.log(`${MODULE_ID} | auth`, ...args);
}
