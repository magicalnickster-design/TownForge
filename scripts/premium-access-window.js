import { MODULE_ID } from "./constants.js";
import { ACCOUNT_URL, AUTH_STATES } from "./auth/auth-constants.js";
import { getAccessStatus, refreshAccessAndPublish } from "./auth/access.js";
import { getState } from "./auth/entitlement-service.js";
import { isSignedIn } from "./auth/account-identity.js";
import { logoutGambitsAccount, openAccountPage, openLoginWindow } from "./auth/login-window.js";
import { getHandlebarsApplicationV2Base } from "./app-api.js";

const HandlebarsApplicationV2 = getHandlebarsApplicationV2Base();

/** Premium gate shown when Barter & Trade is locked. */
export class PremiumAccessWindow extends HandlebarsApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "townforge-premium-access",
    classes: ["townforge", "townforge-premium-access-window"],
    tag: "div",
    window: {
      title: "Barter & Trade",
      resizable: false,
      contentClasses: ["townforge-window-content"]
    },
    position: { width: 520, height: "auto" },
    actions: {
      connectAccount: PremiumAccessWindow.#onConnect,
      openSubscribe: PremiumAccessWindow.#onSubscribe,
      disconnectAccount: PremiumAccessWindow.#onDisconnect
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/auth/premium-access.hbs`
    }
  };

  async _prepareContext() {
    const status = getAccessStatus();
    const authState = getState();
    const signedIn = isSignedIn(authState);
    const isPlayerBlocked = Boolean(!game.user?.isGM);
    const insufficientTier =
      signedIn &&
      !status.canUse &&
      [AUTH_STATES.BELOW_TIER, AUTH_STATES.SUBSCRIPTION_INACTIVE, AUTH_STATES.ENTITLEMENT_DENIED].includes(
        authState
      );

    return {
      signedIn,
      isPlayerBlocked,
      showSubscribe: !isPlayerBlocked && (!signedIn || insufficientTier),
      detailMessage: status.message || ""
    };
  }

  /** @this {PremiumAccessWindow} */
  static async #onConnect() {
    const ok = await openLoginWindow();
    if (ok) await refreshAccessAndPublish({ notify: false });
    if (getAccessStatus().canUse) {
      await this.close();
      return;
    }
    await this.render({ force: true });
  }

  /** @this {PremiumAccessWindow} */
  static #onSubscribe() {
    openAccountPage();
  }

  /** @this {PremiumAccessWindow} */
  static async #onDisconnect() {
    await logoutGambitsAccount();
    await this.render({ force: true });
  }
}

/**
 * @returns {Promise<PremiumAccessWindow|null>}
 */
export async function openPremiumAccessWindow() {
  const existing = foundry.applications.instances.get("townforge-premium-access");
  if (existing) {
    await existing.render({ force: true });
    existing.bringToFront?.();
    return existing;
  }
  const app = new PremiumAccessWindow();
  await app.render({ force: true });
  return app;
}

export function openSubscriptionPage() {
  window.open(ACCOUNT_URL, "_blank", "noopener,noreferrer");
}
