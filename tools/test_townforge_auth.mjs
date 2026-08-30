/**
 * Gambits Forge auth tests for TownForge Barter & Trade gating.
 * Run: node tools/test_townforge_auth.mjs
 */

import assert from "node:assert/strict";
import { PRODUCT_ID } from "../scripts/auth/auth-constants.js";
import { normalizeSessionPayload, stateFromError } from "../scripts/auth/auth-client.js";

function test(name, fn) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("TownForge Gambits Forge auth tests");

test("product id is townforge", () => {
  assert.equal(PRODUCT_ID, "townforge");
});

test("normalizeSessionPayload maps townforge entitlement", () => {
  const normalized = normalizeSessionPayload(
    {
      accessToken: "a",
      refreshToken: "r",
      expiresAt: "2099-01-01T00:00:00.000Z",
      user: { id: "u1", email: "gm@example.com" }
    },
    {
      allowed: true,
      subscriptionStatus: "active",
      plan: "tier1",
      expiresAt: "2099-02-01T00:00:00.000Z"
    }
  );
  assert.equal(normalized.entitlement.productId, "townforge");
  assert.equal(normalized.entitlement.allowed, true);
  assert.equal(normalized.subscription.plan, "tier1");
});

test("stateFromError maps known codes", () => {
  assert.equal(stateFromError({ errorCode: "AUTH_REQUIRED" }), "signed_out");
  assert.equal(stateFromError({ errorCode: "BELOW_TIER" }), "below_tier");
  assert.equal(stateFromError({ errorCode: "BACKEND_UNAVAILABLE" }), "backend_offline");
});

test("auth client requests townforge entitlement path", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          allowed: true,
          entitled: true,
          subscriptionStatus: "active",
          plan: "tier2",
          expiresAt: "2099-01-01T00:00:00.000Z"
        })
    };
  };
  try {
    const { getEntitlement } = await import("../scripts/auth/auth-client.js");
    const result = await getEntitlement("token-1");
    assert.equal(result.ok, true);
    assert.match(calls[0].url, /\/api\/entitlements\/townforge$/);
    assert.equal(calls[0].init.headers.Authorization, "Bearer token-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

console.log("\nAll auth tests passed");
