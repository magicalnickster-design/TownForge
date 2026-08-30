import { AUTH_STATES } from "./auth-constants.js";
import { getState } from "./entitlement-service.js";
import * as SessionStore from "./session-store.js";

function readSceneForgeAccountState() {
  try {
    const value = game.settings?.get?.("sceneforge-ai", "subscriptionAccountState");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function readSceneForgeSessionUser() {
  try {
    const session = game.settings?.get?.("sceneforge-ai", "gambitsAuthSession");
    if (!session || typeof session !== "object") return null;
    return session.user && typeof session.user === "object" ? session.user : null;
  } catch {
    return null;
  }
}

export function formatAccountLabel({ name = "", email = "", accountId = "" } = {}) {
  const cleanName = String(name ?? "").trim();
  const cleanEmail = String(email ?? "").trim();
  const cleanId = String(accountId ?? "").trim();
  if (cleanName && cleanEmail) return `${cleanName} (${cleanEmail})`;
  if (cleanEmail) return cleanEmail;
  if (cleanName) return cleanName;
  if (cleanId) return `Account ${cleanId}`;
  return "";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const clean = String(value ?? "").trim();
    if (clean) return clean;
  }
  return "";
}

export function resolveAccountIdentity({
  session = SessionStore.getSession(),
  entitlement = null,
  sceneForgeAccount = readSceneForgeAccountState(),
  sceneForgeUser = readSceneForgeSessionUser()
} = {}) {
  const sessionUser = session?.user && typeof session.user === "object" ? session.user : null;
  const entitlementUser = entitlement?.user && typeof entitlement.user === "object" ? entitlement.user : null;

  const accountId = firstNonEmpty(
    sessionUser?.id,
    entitlement?.accountId,
    entitlementUser?.id,
    sceneForgeAccount?.accountId,
    sceneForgeUser?.id
  );

  const email = firstNonEmpty(
    sessionUser?.email,
    entitlement?.accountEmail,
    entitlementUser?.email,
    sceneForgeAccount?.accountEmail,
    sceneForgeUser?.email
  );

  const name = firstNonEmpty(
    sessionUser?.displayName,
    sessionUser?.name,
    entitlement?.accountName,
    entitlementUser?.displayName,
    entitlementUser?.name,
    sceneForgeAccount?.accountName,
    sceneForgeUser?.displayName,
    sceneForgeUser?.name
  );

  return {
    accountId,
    email,
    name,
    label: formatAccountLabel({ name, email, accountId })
  };
}

export function resolveSignedInLabel(identity = resolveAccountIdentity(), authState = getState(), options = {}) {
  const hasTokens = options.hasTokens ?? Boolean(SessionStore.getAccessToken() || SessionStore.getRefreshToken());
  const authenticated = authState === AUTH_STATES.AUTHENTICATED || hasTokens;
  if (!authenticated) return "Not Signed In";
  return identity.label || "Signed In";
}

export function isSignedIn(authState = getState()) {
  return Boolean(
    SessionStore.getAccessToken()
    || SessionStore.getRefreshToken()
    || authState === AUTH_STATES.AUTHENTICATED
  );
}
