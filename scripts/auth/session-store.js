import { MODULE_ID } from "../constants.js";
import { SETTING_AUTH_SESSION } from "./auth-constants.js";

const EMPTY_SESSION = Object.freeze({
  accessToken: "",
  refreshToken: "",
  tokenType: "Bearer",
  expiresAt: "",
  rememberMe: false,
  user: null
});

export function registerSessionSettings() {
  if (!globalThis.game?.settings) return;
  if (game.settings.settings?.get?.(`${MODULE_ID}.${SETTING_AUTH_SESSION}`)) return;
  game.settings.register(MODULE_ID, SETTING_AUTH_SESSION, {
    name: "Gambits Auth Session",
    scope: "client",
    config: false,
    type: Object,
    default: {},
    restricted: false
  });
}

export function getSession() {
  const raw = game.settings?.get?.(MODULE_ID, SETTING_AUTH_SESSION);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_SESSION };
  }
  return { ...EMPTY_SESSION, ...raw };
}

export async function setSession(nextSession = {}) {
  const session = {
    ...getSession(),
    ...(nextSession && typeof nextSession === "object" ? nextSession : {})
  };
  delete session.password;
  await game.settings.set(MODULE_ID, SETTING_AUTH_SESSION, session);
  return session;
}

export async function clearSession() {
  await game.settings.set(MODULE_ID, SETTING_AUTH_SESSION, {});
}

export async function clearCorruptedSession() {
  const raw = game.settings?.get?.(MODULE_ID, SETTING_AUTH_SESSION);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return false;
  await clearSession();
  return true;
}

export function getAccessToken() {
  return String(getSession().accessToken ?? "").trim();
}

export function getRefreshToken() {
  return String(getSession().refreshToken ?? "").trim();
}

export function isAccessTokenExpired(bufferSeconds = 30) {
  const expiresAt = String(getSession().expiresAt ?? "").trim();
  if (!expiresAt) return false;
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) return false;
  return timestamp <= Date.now() + bufferSeconds * 1000;
}

export async function importSharedGambitsSessionIfEmpty() {
  const local = getSession();
  if (String(local.accessToken ?? "").trim() || String(local.refreshToken ?? "").trim()) {
    return false;
  }

  const sources = [
    { moduleId: "lootforge", sessionKey: "gambitsAuthSession", stateKey: "subscriptionAccountState" },
    { moduleId: "sceneforge-ai", sessionKey: "gambitsAuthSession", stateKey: "subscriptionAccountState" }
  ];

  for (const source of sources) {
    try {
      const imported = await importSessionFromModule(source.moduleId, source.sessionKey, source.stateKey);
      if (imported) return true;
    } catch {
      // try next source
    }
  }
  return false;
}

/** @deprecated Use importSharedGambitsSessionIfEmpty */
export async function importSceneForgeSessionIfEmpty() {
  return importSharedGambitsSessionIfEmpty();
}

async function importSessionFromModule(moduleId, sessionKey, stateKey) {
  const sf = game.settings?.get?.(moduleId, sessionKey);
  if (!sf || typeof sf !== "object") return false;
  const accessToken = String(sf.accessToken ?? "").trim();
  const refreshToken = String(sf.refreshToken ?? "").trim();
  if (!accessToken && !refreshToken) return false;
  let user = sf.user ?? null;
  if (!user?.email) {
    try {
      const sfState = game.settings?.get?.(moduleId, stateKey);
      if (sfState && typeof sfState === "object") {
        user = {
          id: String(sfState.accountId ?? user?.id ?? ""),
          email: String(sfState.accountEmail ?? user?.email ?? ""),
          displayName: String(sfState.accountName ?? user?.displayName ?? sfState.accountEmail ?? "")
        };
      }
    } catch {
      // ignore
    }
  }
  await setSession({
    accessToken,
    refreshToken,
    tokenType: String(sf.tokenType ?? "Bearer"),
    expiresAt: String(sf.expiresAt ?? ""),
    rememberMe: Boolean(sf.rememberMe),
    user
  });
  return true;
}
