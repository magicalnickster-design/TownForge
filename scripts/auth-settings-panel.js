import { LOG_PREFIX, MODULE_ID } from "./constants.js";
import { getAccessStatus, refreshAccessAndPublish } from "./auth/access.js";
import { isSignedIn } from "./auth/account-identity.js";
import { logoutGambitsAccount, openLoginWindow } from "./auth/login-window.js";
import { restoreSessionOnStartup } from "./auth/entitlement-service.js";
import { registerEntitlementSettings } from "./auth/entitlement-service.js";
import { registerSessionSettings } from "./auth/session-store.js";
import { registerWorldAccessSettings } from "./auth/access.js";
import { DEFAULT_AUTH_API_BASE_URL, SETTING_AUTH_API_BASE_URL } from "./auth/auth-constants.js";

function getHtmlElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function accountLabel() {
  const status = getAccessStatus();
  if (!isSignedIn(status.authState)) return "";
  return status.accountLabel || status.accountEmail || "Connected";
}

function rerenderAuthPanel(rootElement) {
  const panel = rootElement?.querySelector?.(".townforge-gambits-auth-panel");
  if (!panel) return;
  const signedIn = isSignedIn();
  const label = accountLabel();
  const status = panel.querySelector(".townforge-gambits-auth-status");
  const connectBtn = panel.querySelector('[data-action="connectGambits"]');
  const disconnectBtn = panel.querySelector('[data-action="disconnectGambits"]');
  if (status) {
    status.textContent = signedIn ? `Connected as: ${label}` : "Not connected";
  }
  if (connectBtn) connectBtn.hidden = signedIn;
  if (disconnectBtn) disconnectBtn.hidden = !signedIn;
}

export function registerGambitsAuthSettings() {
  registerSessionSettings();
  registerEntitlementSettings();
  registerWorldAccessSettings();

  if (!game.settings.settings?.get?.(`${MODULE_ID}.${SETTING_AUTH_API_BASE_URL}`)) {
    game.settings.register(MODULE_ID, SETTING_AUTH_API_BASE_URL, {
      name: "Gambits Forge API Base URL",
      scope: "client",
      config: false,
      type: String,
      default: DEFAULT_AUTH_API_BASE_URL,
      restricted: false
    });
  }

  Hooks.on("renderSettingsConfig", (_app, html) => {
    const rootElement = getHtmlElement(html);
    if (!rootElement) return;
    if (rootElement.querySelector(".townforge-gambits-auth-panel")) return;

    const anchorInput = rootElement.querySelector(`input[name^="${MODULE_ID}."]`);
    const anchorGroup = anchorInput?.closest(".form-group");
    if (!anchorGroup) return;

    const signedIn = isSignedIn();
    const label = accountLabel();
    const panel = document.createElement("div");
    panel.className = "form-group townforge-gambits-auth-panel";
    panel.innerHTML = `
      <label>Gambits Forge Account</label>
      <div class="form-fields" style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
        <button type="button" class="townforge-btn townforge-btn-primary" data-action="connectGambits" ${signedIn ? "hidden" : ""}>
          Connect Gambits Forge Account
        </button>
        <button type="button" class="townforge-btn townforge-btn-secondary" data-action="disconnectGambits" ${signedIn ? "" : "hidden"}>
          Disconnect
        </button>
      </div>
      <p class="notes townforge-gambits-auth-status" style="margin-top:0.35rem;">
        ${signedIn ? `Connected as: ${foundry.utils.escapeHTML(label)}` : "Not connected"}
      </p>
    `;
    anchorGroup.after(panel);

    panel.querySelector('[data-action="connectGambits"]')?.addEventListener("click", async () => {
      const ok = await openLoginWindow();
      if (ok) await refreshAccessAndPublish({ notify: false });
      rerenderAuthPanel(rootElement);
    });
    panel.querySelector('[data-action="disconnectGambits"]')?.addEventListener("click", async () => {
      await logoutGambitsAccount();
      rerenderAuthPanel(rootElement);
    });
  });

  console.log(`${LOG_PREFIX} Gambits Forge auth settings registered`);
}

export async function initializeGambitsAuth() {
  try {
    await restoreSessionOnStartup({ notify: false });
    if (game.user?.isGM) {
      const { publishWorldAccess } = await import("./auth/access.js");
      await publishWorldAccess();
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Gambits Forge auth startup failed safely`, error);
  }
}
