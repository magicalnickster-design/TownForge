import {
  PRODUCT_ID,
  authDebug,
  getAuthBaseUrl
} from "./auth-constants.js";

function parseResponsePayload(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function normalizeSessionPayload(authPayload = {}, entitlementPayload = {}) {
  return {
    authenticated: true,
    user: {
      id: String(authPayload?.user?.id ?? entitlementPayload?.user?.id ?? ""),
      email: String(authPayload?.user?.email ?? entitlementPayload?.user?.email ?? ""),
      displayName: String(
        authPayload?.user?.displayName
        ?? authPayload?.user?.email
        ?? entitlementPayload?.user?.email
        ?? ""
      )
    },
    subscription: {
      active: String(entitlementPayload?.subscriptionStatus ?? "").toLowerCase() === "active"
        || Boolean(entitlementPayload?.subscription?.active),
      plan: String(entitlementPayload?.plan ?? entitlementPayload?.tier ?? entitlementPayload?.subscription?.plan ?? ""),
      status: String(entitlementPayload?.subscriptionStatus ?? entitlementPayload?.subscription?.status ?? ""),
      currentPeriodEnd: entitlementPayload?.usage?.resetsAt
        ?? entitlementPayload?.expiresAt
        ?? entitlementPayload?.subscription?.currentPeriodEnd
        ?? null
    },
    entitlement: {
      allowed: Boolean(entitlementPayload?.allowed === true),
      productId: PRODUCT_ID,
      moduleId: PRODUCT_ID,
      expiresAt: String(entitlementPayload?.expiresAt ?? entitlementPayload?.entitlementExpiresAt ?? ""),
      signature: String(entitlementPayload?.signature ?? entitlementPayload?.signedEntitlement ?? ""),
      payload: entitlementPayload
    },
    accessToken: String(authPayload?.accessToken ?? ""),
    refreshToken: String(authPayload?.refreshToken ?? ""),
    expiresAt: String(authPayload?.expiresAt ?? "")
  };
}

export async function jsonRequest(path, { method = "GET", body = null, accessToken = "", extraHeaders = {} } = {}) {
  const baseUrl = getAuthBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      status: 0,
      payload: null,
      message: "Backend URL is not configured.",
      errorCode: "BACKEND_UNAVAILABLE",
      endpoint: ""
    };
  }
  const endpoint = `${baseUrl}${path}`;
  try {
    const headers = {
      Accept: "application/json",
      ...extraHeaders
    };
    if (body !== null) headers["Content-Type"] = "application/json";
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    authDebug(method, path);
    const response = await fetch(endpoint, {
      method,
      headers,
      body: body !== null ? JSON.stringify(body) : null
    });
    const rawText = await response.text();
    const payload = parseResponsePayload(rawText);
    const errorCode = String(payload?.errorCode ?? payload?.code ?? payload?.error ?? "").trim() || "";
    const message = String(payload?.message ?? payload?.error ?? payload?.detail ?? "").trim();
    return { ok: response.ok, status: response.status, payload, message, errorCode, endpoint };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: null,
      message: String(error?.message ?? "network error"),
      errorCode: "BACKEND_UNAVAILABLE",
      endpoint
    };
  }
}

export async function login({ email, password, rememberMe }) {
  const authResult = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: {
      email: String(email ?? "").trim(),
      password: String(password ?? "")
    }
  });
  if (!authResult.ok) return authResult;

  const entitlementResult = await getEntitlement(String(authResult.payload?.accessToken ?? ""));
  if (!entitlementResult.ok) {
    authResult.normalized = normalizeSessionPayload(authResult.payload ?? {}, {});
    authResult.normalized.rememberMe = Boolean(rememberMe);
    authResult.entitlementError = entitlementResult;
    return authResult;
  }

  authResult.normalized = normalizeSessionPayload(authResult.payload ?? {}, entitlementResult.payload ?? {});
  authResult.normalized.rememberMe = Boolean(rememberMe);
  return authResult;
}

export async function refresh(refreshToken) {
  const refreshResult = await jsonRequest("/api/auth/refresh", {
    method: "POST",
    body: {
      refreshToken: String(refreshToken ?? "")
    }
  });
  if (!refreshResult.ok) return refreshResult;

  const entitlementResult = await getEntitlement(String(refreshResult.payload?.accessToken ?? ""));
  refreshResult.normalized = normalizeSessionPayload(
    refreshResult.payload ?? {},
    entitlementResult.ok ? entitlementResult.payload ?? {} : {}
  );
  if (!entitlementResult.ok) refreshResult.entitlementError = entitlementResult;
  return refreshResult;
}

export async function logout(refreshToken) {
  if (!refreshToken) {
    return { ok: true, status: 200, payload: null, message: "", errorCode: "", endpoint: "" };
  }
  return jsonRequest("/api/auth/logout", {
    method: "POST",
    body: { refreshToken: String(refreshToken ?? "") }
  });
}

export async function getCurrentUser(accessToken) {
  const result = await jsonRequest("/api/auth/me", {
    method: "GET",
    accessToken
  });
  if (!result.ok) return result;
  const raw = result.payload?.user ?? result.payload ?? {};
  const user = {
    id: String(raw.id ?? raw.userId ?? ""),
    email: String(raw.email ?? ""),
    displayName: String(raw.displayName ?? raw.name ?? raw.email ?? "")
  };
  return {
    ...result,
    payload: user
  };
}

export async function getEntitlement(accessToken) {
  const direct = await jsonRequest(`/api/entitlements/${PRODUCT_ID}`, {
    method: "GET",
    accessToken
  });
  if (direct.ok) return direct;

  // Production account API historically returned 404 for townforge while
  // /api/subscription already encodes plan access. Keep SceneForgeAI's
  // product endpoint preferred; fall back only for missing townforge route.
  if (Number(direct.status) === 404) {
    const fromSubscription = await getEntitlementFromSubscription(accessToken);
    if (fromSubscription.ok || Number(fromSubscription.status) !== 404) {
      return fromSubscription;
    }
  }
  return direct;
}

async function getEntitlementFromSubscription(accessToken) {
  const subResult = await jsonRequest("/api/subscription", {
    method: "GET",
    accessToken
  });
  if (!subResult.ok) {
    return {
      ...subResult,
      errorCode: subResult.errorCode || (subResult.status === 401 ? "SESSION_EXPIRED" : subResult.errorCode)
    };
  }

  const subscription = subResult.payload ?? {};
  const checkedAt = new Date();
  const mapped = mapSubscriptionToTownforgeEntitlement(subscription, checkedAt);
  return {
    ok: mapped.allowed === true,
    status: mapped.allowed === true ? 200 : 403,
    payload: mapped,
    message: mapped.allowed === true ? "" : String(mapped.reason || "entitlement denied"),
    errorCode: mapped.allowed === true
      ? ""
      : String(mapped.reason || "ENTITLEMENT_DENIED").toUpperCase(),
    endpoint: `${getAuthBaseUrl()}/api/subscription`
  };
}

function mapSubscriptionToTownforgeEntitlement(subscription = {}, checkedAt = new Date()) {
  const status = String(subscription?.status ?? subscription?.subscriptionStatus ?? "")
    .trim()
    .toLowerCase() || (subscription?.active === true ? "active" : "inactive");

  const planKey = String(
    subscription?.plan?.slug
    ?? subscription?.plan?.id
    ?? subscription?.planSlug
    ?? subscription?.plan
    ?? subscription?.tier
    ?? ""
  )
    .trim()
    .toLowerCase()
    .replace(/^plan_/, "")
    .replace(/\s+/g, "-");

  const tierMap = {
    adventurer: { tier: 1, tierName: "Adventurer", plan: "adventurer" },
    "dungeon-master": { tier: 2, tierName: "Dungeon Master", plan: "dungeon-master" },
    dungeonmaster: { tier: 2, tierName: "Dungeon Master", plan: "dungeon-master" },
    founder: { tier: 3, tierName: "Founder", plan: "founder" },
    tier1: { tier: 1, tierName: "Adventurer", plan: "adventurer" },
    tier2: { tier: 2, tierName: "Dungeon Master", plan: "dungeon-master" },
    tier3: { tier: 3, tierName: "Founder", plan: "founder" }
  };

  let tierInfo = tierMap[planKey];
  if (!tierInfo) {
    const name = String(subscription?.plan?.name ?? "").toLowerCase();
    if (name.includes("founder")) tierInfo = tierMap.founder;
    else if (name.includes("dungeon")) tierInfo = tierMap["dungeon-master"];
    else if (name.includes("adventurer")) tierInfo = tierMap.adventurer;
    else tierInfo = { tier: 0, tierName: "Free", plan: "free" };
  }

  const checkedIso = checkedAt.toISOString();
  const maxMs = checkedAt.getTime() + 30 * 24 * 60 * 60 * 1000;
  const periodEndMs = Date.parse(String(subscription?.currentPeriodEnd ?? subscription?.expiresAt ?? ""));
  const expiresAt = new Date(
    Number.isFinite(periodEndMs) ? Math.min(periodEndMs, maxMs) : maxMs
  ).toISOString();

  if (status === "suspended") {
    return {
      product: PRODUCT_ID,
      allowed: false,
      entitled: false,
      reason: "account_suspended",
      subscriptionStatus: "suspended",
      checkedAt: checkedIso
    };
  }
  if (status === "expired" || (Number.isFinite(periodEndMs) && periodEndMs <= checkedAt.getTime() && status !== "active")) {
    return {
      product: PRODUCT_ID,
      allowed: false,
      entitled: false,
      reason: "subscription_expired",
      subscriptionStatus: "expired",
      checkedAt: checkedIso
    };
  }
  if (status !== "active" && status !== "trialing") {
    return {
      product: PRODUCT_ID,
      allowed: false,
      entitled: false,
      reason: "subscription_required",
      subscriptionStatus: status || "inactive",
      plan: tierInfo.plan,
      tier: tierInfo.tier,
      tierName: tierInfo.tierName,
      checkedAt: checkedIso
    };
  }
  if (tierInfo.tier < 1) {
    return {
      product: PRODUCT_ID,
      allowed: false,
      entitled: false,
      reason: "tier_too_low",
      subscriptionStatus: status,
      plan: tierInfo.plan,
      tier: tierInfo.tier,
      tierName: tierInfo.tierName,
      checkedAt: checkedIso
    };
  }

  return {
    product: PRODUCT_ID,
    allowed: true,
    entitled: true,
    plan: tierInfo.plan,
    tier: tierInfo.tier,
    tierName: tierInfo.tierName,
    subscriptionStatus: "active",
    expiresAt,
    checkedAt: checkedIso
  };
}

export function stateFromError(result) {
  const code = String(result?.errorCode ?? "").toUpperCase();
  if (code === "AUTH_REQUIRED") return "signed_out";
  if (code === "SESSION_EXPIRED") return "session_expired";
  if (code === "EMAIL_NOT_VERIFIED") return "email_unverified";
  if (code === "SUBSCRIPTION_INACTIVE") return "subscription_inactive";
  if (code === "ENTITLEMENT_DENIED") return "entitlement_denied";
  if (code === "BELOW_TIER" || code === "TIER_TOO_LOW") return "below_tier";
  if (code === "RATE_LIMITED") return "backend_offline";
  if (code === "BACKEND_UNAVAILABLE") return "backend_offline";
  if (Number(result?.status) === 404) return "entitlement_denied";
  return "backend_offline";
}
