import { MODULE_ID } from "../constants.js";
import {
  AUTH_STATES,
  MAX_OFFLINE_MS,
  PRODUCT_ID,
  REFRESH_SOFT_WINDOW_MS,
  SETTING_ENTITLEMENT_CACHE,
  authDebug,
  getAuthBaseUrl
} from "./auth-constants.js";
import * as AuthClient from "./auth-client.js";
import { refreshWithLock } from "./authenticated-fetch.js";
import * as SessionStore from "./session-store.js";
import { resolveAccountIdentity } from "./account-identity.js";

let currentState = AUTH_STATES.SIGNED_OUT;
let currentEntitlement = null;
let lastApiError = "";
let lastLockReason = "";

const TIER_RANK = Object.freeze({
  free: 0,
  none: 0,
  tier1: 1,
  "tier 1": 1,
  tier2: 2,
  "tier 2": 2,
  tier3: 3,
  "tier 3": 3,
  founder: 3,
  owner: 3,
  subscriber: 1
});

export function registerEntitlementSettings() {
  if (!globalThis.game?.settings) return;
  if (game.settings.settings?.get?.(`${MODULE_ID}.${SETTING_ENTITLEMENT_CACHE}`)) return;
  game.settings.register(MODULE_ID, SETTING_ENTITLEMENT_CACHE, {
    name: "TownForge Entitlement Cache",
    scope: "client",
    config: false,
    type: Object,
    default: {},
    restricted: false
  });
}

function setState(nextState) {
  currentState = nextState;
}

export function getState() {
  return currentState;
}

export function getLastLockReason() {
  return lastLockReason || currentState;
}

export function stateMessage(state = currentState) {
  switch (state) {
    case AUTH_STATES.SIGNED_OUT:
      return "Please sign in to Gambits Forge.";
    case AUTH_STATES.EMAIL_UNVERIFIED:
      return "Email is not verified. Please verify your email.";
    case AUTH_STATES.SUBSCRIPTION_INACTIVE:
      return "Subscription is inactive.";
    case AUTH_STATES.ENTITLEMENT_DENIED:
    case AUTH_STATES.BELOW_TIER:
      return "Barter & Trade requires an active Gambits Forge Tier 1 or higher subscription.";
    case AUTH_STATES.BACKEND_OFFLINE:
      return "Authentication backend is offline.";
    case AUTH_STATES.SESSION_EXPIRED:
      return "Session expired. Please sign in again.";
    case AUTH_STATES.ENTITLEMENT_EXPIRED:
      return "Your Barter & Trade access has expired. Connect to the internet and check your subscription.";
    case AUTH_STATES.AUTHENTICATED:
      return "Authenticated.";
    default:
      return "Authentication in progress.";
  }
}

function tierRank(plan) {
  if (typeof plan === "number" && Number.isFinite(plan)) return Math.max(0, Math.floor(plan));
  const key = String(plan ?? "").trim().toLowerCase();
  if (!key) return 0;
  if (Object.prototype.hasOwnProperty.call(TIER_RANK, key)) return TIER_RANK[key];
  if (/^\d+$/.test(key)) return Math.max(0, Number(key));
  if (/tier\s*3|founder|owner/.test(key)) return 3;
  if (/tier\s*2|dungeon/.test(key)) return 2;
  if (/tier\s*1|subscriber|paid|active|adventurer/.test(key)) return 1;
  return 0;
}

function meetsTierRequirement(plan, active) {
  if (!active) return false;
  return tierRank(plan) >= 1;
}

function parseTime(value) {
  const ms = Date.parse(String(value ?? ""));
  return Number.isFinite(ms) ? ms : NaN;
}

function getCachedEntitlement() {
  const raw = game.settings?.get?.(MODULE_ID, SETTING_ENTITLEMENT_CACHE);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw;
}

async function setCachedEntitlement(cache) {
  await game.settings.set(MODULE_ID, SETTING_ENTITLEMENT_CACHE, cache && typeof cache === "object" ? cache : {});
}

export async function clearEntitlementCache() {
  await setCachedEntitlement({});
  currentEntitlement = null;
}

function normalizeEntitlement(normalized = {}, sourcePayload = {}, userProfile = null) {
  const identity = resolveAccountIdentity({
    session: SessionStore.getSession(),
    entitlement: {
      accountId: normalized?.user?.id,
      accountEmail: normalized?.user?.email,
      accountName: normalized?.user?.displayName,
      user: userProfile ?? normalized?.user ?? null
    }
  });
  const plan = String(
    normalized?.subscription?.plan
    ?? sourcePayload?.plan
    ?? sourcePayload?.tierName
    ?? sourcePayload?.tier
    ?? "none"
  );
  const active = Boolean(normalized?.subscription?.active)
    || String(sourcePayload?.subscriptionStatus ?? "").toLowerCase() === "active"
    || sourcePayload?.entitled === true;
  const expiresAt = String(
    normalized?.entitlement?.expiresAt
    ?? sourcePayload?.expiresAt
    ?? sourcePayload?.entitlementExpiresAt
    ?? normalized?.subscription?.currentPeriodEnd
    ?? ""
  );
  const allowedFlag = normalized?.entitlement?.allowed === true
    || sourcePayload?.allowed === true
    || sourcePayload?.entitled === true;
  const allowed = allowedFlag && meetsTierRequirement(
    sourcePayload?.tier ?? plan,
    active || allowedFlag
  );
  return {
    productId: PRODUCT_ID,
    linked: Boolean(normalized?.authenticated ?? SessionStore.getAccessToken()),
    active: Boolean(active),
    allowed: Boolean(allowed),
    tier: plan,
    plan,
    expiresAt,
    fetchedAt: new Date().toISOString(),
    signature: String(normalized?.entitlement?.signature ?? sourcePayload?.signature ?? ""),
    user: userProfile ?? normalized?.user ?? null,
    accountId: identity.accountId,
    accountEmail: identity.email,
    accountName: identity.name || identity.email
  };
}

function isCacheUsable(cache, { allowOffline = true } = {}) {
  if (!cache || typeof cache !== "object") return { ok: false, reason: AUTH_STATES.ENTITLEMENT_DENIED };
  if (cache.productId && cache.productId !== PRODUCT_ID) {
    return { ok: false, reason: AUTH_STATES.ENTITLEMENT_DENIED };
  }
  if (!cache.allowed) return { ok: false, reason: AUTH_STATES.ENTITLEMENT_DENIED };
  if (!meetsTierRequirement(cache.plan ?? cache.tier, cache.active !== false || cache.allowed)) {
    return { ok: false, reason: AUTH_STATES.BELOW_TIER };
  }

  const expiresMs = parseTime(cache.expiresAt);
  if (!Number.isFinite(expiresMs)) {
    return { ok: false, reason: AUTH_STATES.ENTITLEMENT_EXPIRED };
  }
  if (Date.now() >= expiresMs) {
    return { ok: false, reason: AUTH_STATES.ENTITLEMENT_EXPIRED };
  }

  const fetchedMs = parseTime(cache.fetchedAt);
  if (Number.isFinite(fetchedMs) && Date.now() - fetchedMs > MAX_OFFLINE_MS) {
    return { ok: false, reason: AUTH_STATES.ENTITLEMENT_EXPIRED };
  }

  if (!allowOffline && !navigator.onLine) {
    return { ok: false, reason: AUTH_STATES.BACKEND_OFFLINE };
  }

  return { ok: true, expiresMs, fetchedMs };
}

function shouldRefreshSoon(cache) {
  const expiresMs = parseTime(cache?.expiresAt);
  if (!Number.isFinite(expiresMs)) return true;
  return expiresMs - Date.now() < REFRESH_SOFT_WINDOW_MS;
}

function applyLocalEntitlement(entitlement, state = AUTH_STATES.AUTHENTICATED) {
  currentEntitlement = entitlement;
  lastApiError = "";
  lastLockReason = state === AUTH_STATES.AUTHENTICATED ? "" : state;
  setState(state);
}

export function getEntitlementSnapshot() {
  return currentEntitlement;
}

export function isLocallyEntitled() {
  if (currentState === AUTH_STATES.AUTHENTICATED && currentEntitlement?.allowed) return true;
  const cache = getCachedEntitlement();
  const usable = isCacheUsable(cache);
  return usable.ok;
}

export async function syncEntitlement({ notify = false, force = false } = {}) {
  const session = SessionStore.getSession();
  let accessToken = String(session.accessToken ?? "").trim();
  const refreshToken = String(session.refreshToken ?? "").trim();
  if (!accessToken && !refreshToken) {
    const cache = getCachedEntitlement();
    const usable = isCacheUsable(cache);
    if (usable.ok) {
      applyLocalEntitlement(cache, AUTH_STATES.AUTHENTICATED);
      return { ok: true, entitlement: cache, offline: true };
    }
    setState(AUTH_STATES.SIGNED_OUT);
    lastLockReason = AUTH_STATES.SIGNED_OUT;
    currentEntitlement = null;
    return { ok: false, reason: AUTH_STATES.SIGNED_OUT };
  }

  setState(AUTH_STATES.LOADING);

  if (SessionStore.isAccessTokenExpired() && refreshToken) {
    const refreshed = await refreshWithLock();
    if (refreshed.ok) accessToken = SessionStore.getAccessToken();
  }

  let snapshot = await AuthClient.getEntitlement(accessToken);
  if (!snapshot.ok && Number(snapshot.status) === 401 && refreshToken) {
    const refreshResult = await refreshWithLock();
    if (refreshResult?.ok) {
      snapshot = await AuthClient.getEntitlement(SessionStore.getAccessToken());
    }
  }

  if (!snapshot.ok) {
    const cache = getCachedEntitlement();
    const usable = isCacheUsable(cache);
    if (usable.ok && (snapshot.errorCode === "BACKEND_UNAVAILABLE" || snapshot.status === 0 || snapshot.status >= 500)) {
      authDebug("using cached entitlement during backend failure");
      applyLocalEntitlement(cache, AUTH_STATES.AUTHENTICATED);
      return { ok: true, entitlement: cache, offline: true, degraded: true };
    }

    const nextState = AuthClient.stateFromError(snapshot);
    setState(nextState);
    lastApiError = snapshot?.message ?? snapshot?.errorCode ?? "";
    lastLockReason = nextState;
    if (notify) ui.notifications.error(`TownForge: ${snapshot?.message || stateMessage(nextState)}`);
    return { ok: false, reason: nextState, status: snapshot.status, payload: snapshot.payload };
  }

  const normalized = AuthClient.normalizeSessionPayload(SessionStore.getSession(), snapshot.payload ?? {});
  let userProfile = normalized?.user?.email ? normalized.user : null;
  if (!userProfile?.email && accessToken) {
    const profileResult = await AuthClient.getCurrentUser(accessToken);
    if (profileResult.ok && profileResult.payload?.email) {
      userProfile = profileResult.payload;
      await SessionStore.setSession({ user: userProfile });
    }
  }
  const entitlement = normalizeEntitlement(normalized, snapshot.payload ?? {}, userProfile);

  if (!entitlement.allowed) {
    await setCachedEntitlement({});
    const reason = entitlement.active ? AUTH_STATES.BELOW_TIER : AUTH_STATES.SUBSCRIPTION_INACTIVE;
    applyLocalEntitlement(entitlement, reason);
    if (notify) ui.notifications.error(`TownForge: ${stateMessage(reason)}`);
    return { ok: false, reason, payload: snapshot.payload, entitlement };
  }

  const expiresMs = parseTime(entitlement.expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    await setCachedEntitlement({});
    applyLocalEntitlement(entitlement, AUTH_STATES.ENTITLEMENT_EXPIRED);
    if (notify) ui.notifications.error(`TownForge: ${stateMessage(AUTH_STATES.ENTITLEMENT_EXPIRED)}`);
    return { ok: false, reason: AUTH_STATES.ENTITLEMENT_EXPIRED, entitlement };
  }

  await setCachedEntitlement(entitlement);
  applyLocalEntitlement(entitlement, AUTH_STATES.AUTHENTICATED);
  authDebug("entitlement synced", { plan: entitlement.plan, expiresAt: entitlement.expiresAt });
  return { ok: true, entitlement, payload: snapshot.payload, refreshed: force || shouldRefreshSoon(entitlement) };
}

export async function restoreSessionOnStartup({ notify = false } = {}) {
  await SessionStore.clearCorruptedSession();
  await SessionStore.importSharedGambitsSessionIfEmpty();

  const cache = getCachedEntitlement();
  const usable = isCacheUsable(cache);
  if (usable.ok) {
    applyLocalEntitlement(cache, AUTH_STATES.AUTHENTICATED);
  }

  const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  if (!online) {
    if (usable.ok) return true;
    setState(cache ? AUTH_STATES.ENTITLEMENT_EXPIRED : AUTH_STATES.SIGNED_OUT);
    lastLockReason = getState();
    return false;
  }

  if (!usable.ok || shouldRefreshSoon(cache) || !SessionStore.getAccessToken()) {
    const result = await syncEntitlement({ notify });
    return Boolean(result.ok);
  }

  void syncEntitlement({ notify: false });
  return true;
}

export async function checkSubscription({ notify = true } = {}) {
  const result = await syncEntitlement({ notify, force: true });
  if (result.ok && notify) {
    const plan = String(result.entitlement?.plan ?? "none");
    ui.notifications.info(`TownForge: Account synced. Plan: ${plan}.`);
  }
  return result;
}

export function getDiagnostics() {
  const session = SessionStore.getSession();
  const cache = getCachedEntitlement();
  return {
    apiBaseUrl: getAuthBaseUrl(),
    authState: currentState,
    userEmail: String(currentEntitlement?.accountEmail ?? session?.user?.email ?? ""),
    subscriptionStatus: String(currentEntitlement?.active ? "active" : "inactive"),
    plan: String(currentEntitlement?.plan ?? ""),
    entitlementAllowed: Boolean(currentEntitlement?.allowed),
    entitlementExpiresAt: String(currentEntitlement?.expiresAt ?? cache?.expiresAt ?? ""),
    accessTokenExpiresAt: String(session?.expiresAt ?? ""),
    hasRefreshToken: Boolean(String(session?.refreshToken ?? "").trim()),
    lastApiError: lastApiError ? "[redacted]" : "",
    lockReason: lastLockReason
  };
}
