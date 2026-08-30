import { LOG_PREFIX, MODULE_ID } from "./constants.js";
import { getAccessStatus, refreshAccessAndPublish } from "./auth/access.js";
import { isSignedIn } from "./auth/account-identity.js";
import { checkSubscription, restoreSessionOnStartup } from "./auth/entitlement-service.js";
import { registerEntitlementSettings } from "./auth/entitlement-service.js";
import { registerSessionSettings } from "./auth/session-store.js";
import { registerWorldAccessSettings } from "./auth/access.js";
import { DEFAULT_AUTH_API_BASE_URL, SETTING_AUTH_API_BASE_URL } from "./auth/auth-constants.js";
import { logoutGambitsAccount, openAccountPage, openLoginWindow } from "./auth/login-window.js";
import { getHandlebarsApplicationV2Base } from "./app-api.js";

const HandlebarsApplicationV2 = getHandlebarsApplicationV2Base();

/** Gambits Forge account settings — prominent sign-in for Barter & Trade. */
export class GambitsAccountSettingsApp extends HandlebarsApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "townforge-gambits-account-settings",
    classes: ["townforge", "townforge-gambits-account-settings"],
    tag: "div",
    window: {
      title: "Gambits Forge Account",
      icon: "fa-solid fa-user-shield",
      resizable: false,
      contentClasses: ["townforge-window-content"]
    },
    position: { width: 480, height: "auto" },
    actions: {
      signIn: GambitsAccountSettingsApp.#onSignIn,
      disconnectAccount: GambitsAccountSettingsApp.#onDisconnect,
      syncAccount: GambitsAccountSettingsApp.#onSync,
      openAccount: GambitsAccountSettingsApp.#onOpenAccount
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/auth/account-settings.hbs`
    }
  };

  static async show() {
    const existing = foundry.applications.instances.get("townforge-gambits-account-settings");
    if (existing) {
      await existing.render({ force: true });
      existing.bringToFront?.();
      return existing;
    }
    const app = new GambitsAccountSettingsApp();
    await app.render({ force: true });
    return app;
  }

  async _prepareContext() {
    const status = getAccessStatus();
    return {
      signedIn: status.signedIn,
      accountLabel: status.accountLabel || status.accountEmail || "Connected",
      plan: status.plan || "",
      accessLabel: status.canUse ? "Barter & Trade unlocked" : "Barter & Trade locked",
      message: status.message || ""
    };
  }

  /** @this {GambitsAccountSettingsApp} */
  static async #onSignIn() {
    const ok = await openLoginWindow();
    if (ok) await refreshAccessAndPublish({ notify: false });
    await this.render({ force: true });
  }

  /** @this {GambitsAccountSettingsApp} */
  static async #onDisconnect() {
    await logoutGambitsAccount();
    await this.render({ force: true });
  }

  /** @this {GambitsAccountSettingsApp} */
  static async #onSync() {
    await checkSubscription({ notify: true });
    await refreshAccessAndPublish({ notify: false });
    await this.render({ force: true });
  }

  /** @this {GambitsAccountSettingsApp} */
  static #onOpenAccount() {
    openAccountPage();
  }
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
