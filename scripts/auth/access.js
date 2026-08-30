import { MODULE_ID } from "../constants.js";
import { AUTH_STATES, SETTING_WORLD_ACCESS } from "./auth-constants.js";
import {
  getEntitlementSnapshot,
  getLastLockReason,
  getState,
  isLocallyEntitled,
  stateMessage,
  syncEntitlement
} from "./entitlement-service.js";
import { isSignedIn, resolveAccountIdentity, resolveSignedInLabel } from "./account-identity.js";
import * as SessionStore from "./session-store.js";

export function registerWorldAccessSettings() {
  if (!globalThis.game?.settings) return;
  if (game.settings.settings?.get?.(`${MODULE_ID}.${SETTING_WORLD_ACCESS}`)) return;
  game.settings.register(MODULE_ID, SETTING_WORLD_ACCESS, {
    name: "TownForge Barter & Trade World Access",
    scope: "world",
    config: false,
    type: Object,
    default: { active: false },
    restricted: true
  });
}

function getWorldAccess() {
  const raw = game.settings?.get?.(MODULE_ID, SETTING_WORLD_ACCESS);
  if (!raw || typeof raw !== "object") return { active: false };
  return raw;
}

function worldAccessUsable(access = getWorldAccess()) {
  if (!access?.active) return false;
  const expiresMs = Date.parse(String(access.expiresAt ?? ""));
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) return false;
  return true;
}

export async function publishWorldAccess() {
  if (!game.user?.isGM) return getWorldAccess();
  if (!isLocallyEntitled()) {
    const current = getWorldAccess();
    if (current?.updatedBy === game.user.id) {
      await game.settings.set(MODULE_ID, SETTING_WORLD_ACCESS, {
        active: false,
        updatedBy: game.user.id,
        updatedAt: new Date().toISOString()
      });
    }
    return getWorldAccess();
  }

  const entitlement = getEntitlementSnapshot();
  const next = {
    active: true,
    productId: "townforge",
    accountEmail: String(entitlement?.accountEmail ?? SessionStore.getSession()?.user?.email ?? ""),
    plan: String(entitlement?.plan ?? ""),
    expiresAt: String(entitlement?.expiresAt ?? ""),
    updatedBy: game.user.id,
    updatedAt: new Date().toISOString()
  };
  await game.settings.set(MODULE_ID, SETTING_WORLD_ACCESS, next);
  return next;
}

/** GM must be entitled locally; players use world access published by the GM. */
export function canUseBarterTrade() {
  if (game.user?.isGM) return isLocallyEntitled();
  return worldAccessUsable();
}

export function getAccessStatus() {
  const entitledLocal = isLocallyEntitled();
  const world = getWorldAccess();
  const entitlement = getEntitlementSnapshot();
  const identity = resolveAccountIdentity({ entitlement });
  return {
    canUse: canUseBarterTrade(),
    isGM: Boolean(game.user?.isGM),
    localEntitled: entitledLocal,
    worldActive: worldAccessUsable(world),
    authState: getState(),
    lockReason: getLastLockReason() || getState(),
    message: resolveAccessMessage(),
    signedIn: isSignedIn(),
    accountLabel: resolveSignedInLabel(identity, getState()),
    accountEmail: String(identity.email || world?.accountEmail || ""),
    accountName: String(identity.name || ""),
    plan: String(entitlement?.plan ?? world?.plan ?? ""),
    expiresAt: String(entitlement?.expiresAt ?? world?.expiresAt ?? "")
  };
}

export function resolveAccessMessage() {
  if (canUseBarterTrade()) return "";
  if (!game.user?.isGM) {
    if (worldAccessUsable()) return "";
    return "Barter & Trade requires the GM to connect a Gambits Forge account with Tier 1 or higher.";
  }
  const reason = getLastLockReason() || getState();
  if (reason === AUTH_STATES.ENTITLEMENT_EXPIRED) {
    return stateMessage(AUTH_STATES.ENTITLEMENT_EXPIRED);
  }
  if (reason === AUTH_STATES.SIGNED_OUT || reason === AUTH_STATES.SESSION_EXPIRED) {
    return stateMessage(reason);
  }
  return "Barter & Trade is a Gambits Forge Premium feature. Unlock it with a Tier 1 subscription or higher.";
}

export async function requireBarterTradeAccess({ openWindow = true } = {}) {
  if (canUseBarterTrade()) return true;
  if (openWindow) {
    const { openPremiumAccessWindow } = await import("../premium-access-window.js");
    await openPremiumAccessWindow();
  }
  return false;
}

export async function refreshAccessAndPublish({ notify = false } = {}) {
  const result = await syncEntitlement({ notify });
  if (game.user?.isGM) await publishWorldAccess();
  return result;
}
