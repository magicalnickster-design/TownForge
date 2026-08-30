import * as AuthClient from "./auth-client.js";
import * as SessionStore from "./session-store.js";

let refreshInFlight = null;

export async function refreshWithLock() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = SessionStore.getRefreshToken();
    if (!refreshToken) {
      await SessionStore.clearSession();
      return { ok: false, reason: "missing_refresh_token" };
    }
    const refreshResult = await AuthClient.refresh(refreshToken);
    if (!refreshResult.ok) {
      await SessionStore.clearSession();
      return { ok: false, reason: refreshResult.errorCode || "refresh_failed", status: refreshResult.status };
    }
    const normalized = refreshResult.normalized ?? {};
    await SessionStore.setSession({
      accessToken: String(normalized?.accessToken ?? ""),
      refreshToken: String(normalized?.refreshToken ?? refreshToken),
      tokenType: "Bearer",
      expiresAt: String(normalized?.expiresAt ?? ""),
      user: normalized?.user ?? SessionStore.getSession().user ?? null
    });
    return { ok: true, entitlementError: refreshResult.entitlementError ?? null };
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function authenticatedFetch(input, init = {}, options = {}) {
  const opts = { retryOnUnauthorized: true, promptLoginOnFailure: true, ...options };
  let session = SessionStore.getSession();
  if (SessionStore.isAccessTokenExpired() && SessionStore.getRefreshToken()) {
    await refreshWithLock();
    session = SessionStore.getSession();
  }
  const accessToken = String(session.accessToken ?? "").trim();
  const headers = new Headers(init?.headers ?? {});
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const firstResponse = await fetch(input, { ...init, headers });
  if (!(opts.retryOnUnauthorized && firstResponse.status === 401)) {
    return firstResponse;
  }

  const refreshResult = await refreshWithLock();
  if (!refreshResult.ok) {
    if (opts.promptLoginOnFailure) {
      const { openLoginWindow } = await import("./login-window.js");
      void openLoginWindow();
    }
    return firstResponse;
  }

  const retriedHeaders = new Headers(init?.headers ?? {});
  const retriedToken = SessionStore.getAccessToken();
  if (retriedToken) retriedHeaders.set("Authorization", `Bearer ${retriedToken}`);
  const retriedResponse = await fetch(input, { ...init, headers: retriedHeaders });
  if (retriedResponse.status === 401 && opts.promptLoginOnFailure) {
    await SessionStore.clearSession();
    const { openLoginWindow } = await import("./login-window.js");
    void openLoginWindow();
  }
  return retriedResponse;
}
