import { LOG_PREFIX, MODULE_ID, MODULE_TITLE } from "./constants.js";
import { registerTownForgeSceneControl } from "./scene-control.js";

/**
 * TownForge module entrypoint.
 * Only constants and scene-control are imported eagerly; ApplicationV2 UIs
 * load inside hooks once Foundry's globals (foundry, game) are available.
 */

console.log(`${LOG_PREFIX} Module scripts loaded`);

/** @type {Promise<typeof import("./npc-browser.js").NpcBrowser>|null} */
let npcBrowserClassPromise = null;

/** @returns {Promise<typeof import("./npc-browser.js").NpcBrowser>} */
function loadNpcBrowserClass() {
  npcBrowserClassPromise ??= import("./npc-browser.js").then((module) => module.NpcBrowser);
  return npcBrowserClassPromise;
}

/** @returns {Promise<unknown>} */
function openNpcBrowser() {
  return loadNpcBrowserClass().then((NpcBrowser) => NpcBrowser.show());
}

Hooks.on("getSceneControlButtons", (controls) => {
  try {
    registerTownForgeSceneControl(controls, openNpcBrowser);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to register scene control button`, error);
  }
});

Hooks.once("init", async () => {
  try {
    const version = game.modules.get(MODULE_ID)?.version ?? "0.8.1";
    console.log(`${LOG_PREFIX} Initializing ${MODULE_TITLE} v${version}`);
    const { registerTownForgeSettings } = await import("./settings.js");
    const { registerGambitsAuthSettings } = await import("./auth-settings-panel.js");
    registerTownForgeSettings();
    registerGambitsAuthSettings();
  } catch (error) {
    console.error(`${LOG_PREFIX} Init failed — settings and scene controls will be unavailable`, error);
    ui.notifications?.error?.(`${MODULE_TITLE} failed to initialize. Check the browser console (F12).`);
  }
});

Hooks.once("ready", async () => {
  let shopApi = {};
  try {
    const hooks = await import("./shop-hooks.js");
    shopApi = hooks.shopApi;
    hooks.registerShopHooks();
    const { readySaneMagicalPrices } = await import("./sane-magical-prices.js");
    await readySaneMagicalPrices();
    const { initializeGambitsAuth } = await import("./auth-settings-panel.js");
    await initializeGambitsAuth();
  } catch (error) {
    console.error(`${LOG_PREFIX} Shop hooks failed to register`, error);
  }

  let npcService;
  let shopService;
  let NpcBrowser;
  try {
    const [npcModule, catalogModule, browserModule, shopModule] = await Promise.all([
      import("./npc-service.js"),
      import("./shop-catalogs.js"),
      import("./npc-browser.js"),
      import("./shop-service.js")
    ]);
    npcService = npcModule.npcService;
    shopService = shopModule.shopService;
    NpcBrowser = browserModule.NpcBrowser;
    await Promise.all([npcService.ready(), catalogModule.readyShopCatalogs(), loadNpcBrowserClass()]);
  } catch (error) {
    console.error(`${LOG_PREFIX} Ready hook failed while loading NPC library`, error);
    return;
  }

  console.log(`${LOG_PREFIX} Module ready`);

  globalThis.townforge = Object.freeze({
    id: MODULE_ID,
    title: MODULE_TITLE,
    openBrowser: () => NpcBrowser.show(),
    npcService,
    shopService,
    shop: shopApi,
    version: game.modules.get(MODULE_ID)?.version ?? "0.8.1"
  });
});
