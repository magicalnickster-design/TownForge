import { LOG_PREFIX } from "./constants.js";
import { MerchantApp } from "./merchant-app.js";
import { shopService } from "./shop-service.js";
import { ShopkeeperConfig } from "./shopkeeper-config.js";
import {
  buyerCurrencyChanged,
  refreshOpenShopUIs,
  refreshOpenShopUIsForBuyer,
  shopkeeperFlagsChanged
} from "./shop-sync.js";

let tokenClickPatched = false;

/**
 * Register shopkeeper-related hooks and a careful token double-click interceptor.
 */
export function registerShopHooks() {
  shopService.registerSockets();

  // Live sync: when shop stock/config flags change on any client, refresh open shop UIs.
  Hooks.on("updateActor", (actor, changes) => {
    if (!actor) return;
    if (shopkeeperFlagsChanged(changes)) {
      refreshOpenShopUIs(actor);
      return;
    }
    if (buyerCurrencyChanged(changes)) {
      refreshOpenShopUIsForBuyer(actor);
    }
  });

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

  Hooks.on("getActorContextOptions", (actor, menuItems) => {
    addShopContextOptions(actor, menuItems);
  });

  Hooks.on("getTokenContextOptions", (application, menuItems) => {
    const actor = application?.document?.actor ?? application?.actor;
    addShopContextOptions(actor, menuItems);
  });

  // Backup: Token HUD store button (works even if double-click is blocked elsewhere).
  Hooks.on("renderTokenHUD", (app, html) => {
    try {
      addShopHudButton(app, html);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed adding Token HUD shop button`, error);
    }
  });

  Hooks.on("canvasReady", () => {
    patchTokenDoubleClick();
  });

  if (canvas?.ready) patchTokenDoubleClick();

  // Migrate existing enabled shopkeepers so players can observe/open them.
  if (game.user?.isGM) {
    void shopService.ensureAllEnabledShopAccess();
  }

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
 * @param {TokenHUD} app
 * @param {HTMLElement|JQuery} html
 */
function addShopHudButton(app, html) {
  const token = app.object ?? app.token ?? canvas?.tokens?.controlled?.[0];
  const actor = token?.actor;
  if (!isOpenableShopkeeper(token, actor)) return;

  const root = html?.jquery ? html[0] : html;
  if (!root?.querySelector) return;
  if (root.querySelector("[data-townforge-open-shop]")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-icon";
  button.dataset.townforgeOpenShop = "1";
  button.title = "Open Shop";
  button.setAttribute("aria-label", "Open Shop");
  button.innerHTML = `<i class="fa-solid fa-store"></i>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void MerchantApp.show(actor);
  });

  const column =
    root.querySelector(".col.right") ||
    root.querySelector(".col.left") ||
    root.querySelector(".col") ||
    root;
  column.append(button);
}

/**
 * Living enabled shopkeeper that should open the TownForge merchant UI.
 * @param {Token|null|undefined} token
 * @param {Actor|null|undefined} actor
 * @returns {boolean}
 */
export function isOpenableShopkeeper(token, actor) {
  if (!actor) return false;
  if (shouldDeferTokenClick(token, actor)) return false;
  return Boolean(shopService.getShopkeeper(actor)?.enabled);
}

/**
 * Defer to LootForge / core for corpses and LootForge-managed tokens.
 * Living enabled shopkeepers open the TownForge merchant window.
 *
 * @param {Token} token
 * @param {Actor|null} actor
 * @returns {boolean}
 */
export function shouldDeferTokenClick(token, actor) {
  if (!actor) return true;

  // Dead creatures should remain available to LootForge corpse looting.
  const hp = actor.system?.attributes?.hp?.value;
  if (hp != null && Number(hp) <= 0) return true;

  const tokenDoc = token?.document;
  if (hasLootForgeMark(actor) || hasLootForgeMark(tokenDoc)) return true;

  // If LootForge exposes a known helper, respect it when present.
  try {
    const lootforge = game.modules?.get("lootforge");
    if (lootforge?.active) {
      const api = game.lootforge ?? globalThis.LootForge ?? null;
      if (typeof api?.isLootable === "function" && api.isLootable(tokenDoc ?? actor)) {
        return true;
      }
      if (typeof api?.shouldHandleTokenClick === "function" && api.shouldHandleTokenClick(token)) {
        return true;
      }
    }
  } catch (_error) {
    // Ignore LootForge probe failures and continue with TownForge logic.
  }

  return false;
}

function hasLootForgeMark(doc) {
  if (!doc?.flags) return false;
  const flags = doc.flags;
  if (flags.lootforge || flags.LootForge) return true;
  // Common loot-module markers.
  if (flags["item-piles"]?.data?.enabled && doc.actor?.system?.attributes?.hp?.value <= 0) {
    return true;
  }
  return false;
}

/**
 * Intercept token double-click for living enabled shopkeepers only.
 * Players always open the merchant UI.
 * GM opens merchant UI unless Shift is held (then Actor sheet).
 *
 * Foundry stores clickLeft2 permission/callback refs on each Token's
 * MouseInteractionManager at draw time, so we patch the prototype AND
 * rebind every existing/new token manager. Without the permission rebind,
 * players get no double-click event at all on unowned NPCs.
 */
function patchTokenDoubleClick() {
  const TokenClass = CONFIG.Token?.objectClass ?? foundry.canvas?.placeables?.Token;
  if (!TokenClass?.prototype) {
    console.warn(`${LOG_PREFIX} Token class unavailable; shop double-click not patched`);
    return;
  }

  patchTokenCanView(TokenClass);
  patchTokenClickLeft2(TokenClass);

  // Rebind managers for tokens already on the canvas.
  for (const token of canvas?.tokens?.placeables ?? []) {
    bindTokenShopInteraction(token);
  }

  if (!patchTokenDoubleClick._drawHooked) {
    Hooks.on("drawToken", (token) => {
      bindTokenShopInteraction(token);
    });
    patchTokenDoubleClick._drawHooked = true;
  }
}

/**
 * @param {typeof Token} TokenClass
 */
function patchTokenClickLeft2(TokenClass) {
  if (tokenClickPatched) return;

  const original = TokenClass.prototype._onClickLeft2;
  if (typeof original !== "function") {
    console.warn(`${LOG_PREFIX} Token#_onClickLeft2 missing; shop double-click not patched`);
    return;
  }

  if (original.__townforgeShopWrapped) {
    tokenClickPatched = true;
    return;
  }

  function townforgeOnClickLeft2(event) {
    if (tryOpenShopFromToken(this, event)) return;
    return original.call(this, event);
  }

  townforgeOnClickLeft2.__townforgeShopWrapped = true;
  TokenClass.prototype._onClickLeft2 = townforgeOnClickLeft2;
  tokenClickPatched = true;
  console.log(`${LOG_PREFIX} Token double-click interceptor installed`);
}

/**
 * Allow all users to "view" (double-click) living enabled shopkeepers.
 * @param {typeof Token} TokenClass
 */
function patchTokenCanView(TokenClass) {
  const original = TokenClass.prototype._canView;
  if (typeof original !== "function") {
    console.warn(`${LOG_PREFIX} Token#_canView missing; player shop clicks may stay blocked`);
    return;
  }
  if (original.__townforgeShopCanViewWrapped) return;

  function townforgeCanView(user, event) {
    try {
      if (isOpenableShopkeeper(this, this.actor)) return true;
    } catch (error) {
      console.error(`${LOG_PREFIX} Token#_canView shop check failed`, error);
    }
    return original.call(this, user, event);
  }

  townforgeCanView.__townforgeShopCanViewWrapped = true;
  TokenClass.prototype._canView = townforgeCanView;
  console.log(`${LOG_PREFIX} Token#_canView interceptor installed for shopkeepers`);
}

/**
 * Rebind a Token's MouseInteractionManager so player double-clicks reach TownForge.
 * @param {Token} token
 */
function bindTokenShopInteraction(token) {
  const mim = token?.mouseInteractionManager;
  if (!mim) return;

  // Permission: Foundry ignores clickLeft2 unless this returns true.
  if (!mim.permissions?.clickLeft2?.__townforgeShopCanViewWrapped) {
    const previous = mim.permissions?.clickLeft2;
    const wrappedPerm = function townforgeShopCanView(user, event) {
      try {
        if (isOpenableShopkeeper(this, this.actor)) return true;
      } catch (error) {
        console.error(`${LOG_PREFIX} MIM clickLeft2 permission failed`, error);
      }
      if (typeof previous === "function") return previous.call(this, user, event);
      return Boolean(previous);
    };
    wrappedPerm.__townforgeShopCanViewWrapped = true;
    mim.permissions.clickLeft2 = wrappedPerm;
  }

  // Callback: open merchant UI for shopkeepers.
  if (!mim.callbacks?.clickLeft2?.__townforgeShopWrapped) {
    const previous = mim.callbacks?.clickLeft2;
    const wrappedClick = function townforgeShopClickLeft2(event) {
      if (tryOpenShopFromToken(this, event)) return false;
      if (typeof previous === "function") return previous.call(this, event);
    };
    wrappedClick.__townforgeShopWrapped = true;
    // Keep token as `this` for Foundry's manager invocation patterns.
    mim.callbacks.clickLeft2 = wrappedClick;
  }
}

/**
 * @param {Token} token
 * @param {Event} event
 * @returns {boolean} true when TownForge handled the click
 */
function tryOpenShopFromToken(token, event) {
  try {
    const actor = token?.actor;
    if (!isOpenableShopkeeper(token, actor)) return false;
    const openSheet = game.user.isGM && Boolean(event?.shiftKey);
    if (openSheet) return false;

    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    void MerchantApp.show(actor).catch((error) => {
      console.error(`${LOG_PREFIX} Failed opening merchant from token double-click`, error);
      ui.notifications?.error("TownForge could not open the shop.");
    });
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Token double-click interceptor failed`, error);
    return false;
  }
}

/**
 * Convenience helpers exposed on the public API.
 */
export const shopApi = Object.freeze({
  openConfig: (actor) => ShopkeeperConfig.show(actor),
  openMerchant: (actor) => MerchantApp.show(actor),
  openItemSources: async () => {
    const { ShopItemSourcesApp } = await import("./settings.js");
    return ShopItemSourcesApp.show();
  },
  enable: (actor, options) => shopService.enableShopkeeper(actor, options),
  regenerate: (actor) => shopService.regenerateInventory(actor, { force: true }),
  shouldDeferTokenClick,
  isOpenableShopkeeper,
  refreshOpenShopUIs,
  service: shopService
});
