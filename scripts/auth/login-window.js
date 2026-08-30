import { ACCOUNT_URL } from "./auth-constants.js";
import * as AuthClient from "./auth-client.js";
import { refreshAccessAndPublish } from "./access.js";
import { clearEntitlementCache } from "./entitlement-service.js";
import * as SessionStore from "./session-store.js";

export async function performLogin(formData) {
  const result = await AuthClient.login(formData);
  if (!result.ok) {
    const code = String(result?.errorCode ?? "").toUpperCase();
    if (code === "EMAIL_NOT_VERIFIED") {
      ui.notifications.error("TownForge: Email verification required. Please verify your account.");
    } else if (code === "AUTH_REQUIRED" || code === "SESSION_EXPIRED") {
      ui.notifications.error("TownForge: Session expired. Please sign in again.");
    } else if (code === "BACKEND_UNAVAILABLE") {
      ui.notifications.error("TownForge: Backend unavailable. Please retry.");
    } else {
      ui.notifications.error(`TownForge: ${result.message || "Sign in failed."}`);
    }
    return false;
  }

  const normalized = result.normalized ?? {};
  await SessionStore.setSession({
    accessToken: String(normalized?.accessToken ?? ""),
    refreshToken: String(normalized?.refreshToken ?? ""),
    tokenType: "Bearer",
    expiresAt: String(normalized?.expiresAt ?? ""),
    rememberMe: Boolean(formData.rememberMe),
    user: normalized?.user ?? null
  });

  const entitlementResult = await refreshAccessAndPublish({ notify: false });
  if (entitlementResult?.ok) {
    ui.notifications.info("TownForge: Signed in successfully.");
    return true;
  }
  ui.notifications.warn("TownForge: Signed in, but Barter & Trade access could not be verified.");
  return true;
}

export function openLoginWindow({ title = "TownForge — Gambits Forge Login" } = {}) {
  const content = `
    <form class="townforge-gambits-login">
      <p><strong>Gambits Forge</strong></p>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" autocomplete="username" required />
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" name="password" autocomplete="current-password" required />
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:6px;">
          <input type="checkbox" name="rememberMe" />
          Remember Me
        </label>
      </div>
    </form>
  `;

  return new Promise((resolve) => {
    const dialog = new Dialog({
      title,
      content,
      buttons: {
        signin: {
          label: "Sign In",
          callback: (html) => {
            void (async () => {
              const root = html?.[0] ?? html;
              const email = root?.querySelector?.('input[name="email"]')?.value ?? "";
              const password = root?.querySelector?.('input[name="password"]')?.value ?? "";
              const rememberMe = Boolean(root?.querySelector?.('input[name="rememberMe"]')?.checked);
              const ok = await performLogin({ email, password, rememberMe });
              resolve(ok);
            })();
          }
        },
        forgot: {
          label: "Forgot Password",
          callback: () => {
            window.open(ACCOUNT_URL, "_blank", "noopener,noreferrer");
            resolve(false);
          }
        },
        create: {
          label: "Create Account",
          callback: () => {
            window.open(ACCOUNT_URL, "_blank", "noopener,noreferrer");
            resolve(false);
          }
        }
      },
      default: "signin",
      close: () => resolve(false)
    });
    dialog.render(true);
  });
}

export async function logoutGambitsAccount() {
  await AuthClient.logout(SessionStore.getRefreshToken());
  await SessionStore.clearSession();
  await clearEntitlementCache();
  const { publishWorldAccess } = await import("./access.js");
  await publishWorldAccess();
  ui.notifications.info("TownForge: Disconnected from Gambits Forge.");
}

export function openAccountPage() {
  window.open(ACCOUNT_URL, "_blank", "noopener,noreferrer");
}
