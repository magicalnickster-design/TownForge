import { LOG_PREFIX, MODULE_ID } from "./constants.js";
import { MerchantApp } from "./merchant-app.js";
import { shopService } from "./shop-service.js";
import { ShopkeeperConfig } from "./shopkeeper-config.js";

let tokenClickPatched = false;

/**
 * Register shopkeeper-related hooks and a careful token double-click interceptor.
 */
export function registerShopHooks() {
  shopService.registerSockets();

  // GM header control on Actor sheets (AppV2).
  Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
    const actor = app.document;
    if (!game.user.isGM || !actor || actor.documentName !== "Actor") return;
    if (actor.type !== "npc") return;
    if (controls.some((control) => control.action === "townforgeShopkeeper")) return;

    controls.push({
      action: "townforgeShopkeeper",
      icon: "fa-solid fa-store",
      label: "TownForge Shopkeeper",
      onClick: () => {
        void ShopkeeperConfig.show(actor);
      }
    });
  });

  // Fallback for any remaining AppV1 sheets.
  Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
    const actor = app.document ?? app.actor;
    if (!game.user.isGM || !actor || actor.type !== "npc") return;
    if (buttons.some((button) => button.class === "townforge-shopkeeper")) return;
    buttons.unshift({
      class: "townforge-shopkeeper",
      icon: "fas fa-store",
      label: "Shopkeeper",
      onclick: () => void ShopkeeperConfig.show(actor)
    });
  });

  // Directory / sidebar actor context menu (when available).
  Hooks.on("getActorContextOptions", (actor, menuItems) => {
    addShopContextOptions(actor, menuItems);
  });

  // Token right-click context menu (Foundry v13+).
  Hooks.on("getTokenContextOptions", (application, menuItems) => {
    const actor = application?.document?.actor ?? application?.actor;
    addShopContextOptions(actor, menuItems);
  });

  Hooks.once("canvasReady", () => {
    patchTokenDoubleClick();
  });

  // If canvas is already ready (hot reload), patch immediately.
  if (canvas?.ready) patchTokenDoubleClick();

  console.log(`${LOG_PREFIX} Shopkeeper hooks registered`);
}

/**
 * @param {Actor|null|undefined} actor
 * @param {object[]} menuItems
 */
function addShopContextOptions(actor, menuItems) {
  if (!actor || actor.type !== "npc" || !Array.isArray(menuItems)) return;
  const shop = shopService.getShopkeeper(actor);
  if (shop.enabled) {
    menuItems.push({
      name: "TownForge: Open Shop",
      icon: '<i class="fa-solid fa-store"></i>',
      callback: () => void MerchantApp.show(actor)
    });
  }
  if (game.user.isGM) {
    menuItems.push({
      name: "TownForge: Shopkeeper Config",
      icon: '<i class="fa-solid fa-gears"></i>',
      callback: () => void ShopkeeperConfig.show(actor)
    });
    if (shop.enabled) {
      menuItems.push({
        name: "TownForge: Open Actor Sheet",
        icon: '<i class="fa-solid fa-user"></i>',
        callback: () => void actor.sheet?.render(true)
      });
    }
  }
}

/**
 * Intercept token double-click for enabled shopkeepers.
 * Players always open the merchant UI.
 * GM opens merchant UI unless Shift is held (then Actor sheet).
 */
function patchTokenDoubleClick() {
  if (tokenClickPatched) return;
  const TokenClass = CONFIG.Token?.objectClass ?? foundry.canvas?.placeables?.Token;
  if (!TokenClass?.prototype) {
    console.warn(`${LOG_PREFIX} Token class unavailable; shop double-click not patched`);
    return;
  }

  const original = TokenClass.prototype._onClickLeft2;
  if (typeof original !== "function") {
    console.warn(`${LOG_PREFIX} Token#_onClickLeft2 missing; shop double-click not patched`);
    return;
  }

  TokenClass.prototype._onClickLeft2 = function townforgeOnClickLeft2(event) {
    try {
      const actor = this.actor;
      const shop = actor ? shopService.getShopkeeper(actor) : null;
      if (actor && shop?.enabled) {
        const openSheet = game.user.isGM && Boolean(event?.shiftKey);
        if (!openSheet) {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          void MerchantApp.show(actor);
          return;
        }
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Token double-click interceptor failed`, error);
    }
    return original.call(this, event);
  };

  tokenClickPatched = true;
  console.log(`${LOG_PREFIX} Token double-click interceptor installed`);
}

/**
 * Convenience helpers exposed on the public API.
 */
export const shopApi = Object.freeze({
  openConfig: (actor) => ShopkeeperConfig.show(actor),
  openMerchant: (actor) => MerchantApp.show(actor),
  enable: (actor, options) => shopService.enableShopkeeper(actor, options),
  regenerate: (actor) => shopService.regenerateInventory(actor, { force: true }),
  service: shopService
});
