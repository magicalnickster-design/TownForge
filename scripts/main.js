import { LOG_PREFIX, MODULE_ID, MODULE_TITLE } from "./constants.js";
import { NpcBrowser } from "./npc-browser.js";
import { npcService } from "./npc-service.js";
import { readyShopCatalogs } from "./shop-catalogs.js";
import { registerTownForgeSettings } from "./settings.js";
import { registerTownForgeSceneControl } from "./scene-control.js";
import { shopService } from "./shop-service.js";

/**
 * TownForge module entrypoint.
 */

console.log(`${LOG_PREFIX} Module scripts loaded`);

Hooks.once("init", () => {
  try {
    const version = game.modules.get(MODULE_ID)?.version ?? "0.5.7";
    console.log(`${LOG_PREFIX} Initializing ${MODULE_TITLE} v${version}`);
    registerTownForgeSettings();
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
  } catch (error) {
    console.error(`${LOG_PREFIX} Shop hooks failed to register`, error);
  }

  try {
    await Promise.all([npcService.ready(), readyShopCatalogs()]);
  } catch (error) {
    console.error(`${LOG_PREFIX} Ready hook failed while loading NPC library`, error);
  }

  console.log(`${LOG_PREFIX} Module ready`);

  globalThis.townforge = Object.freeze({
    id: MODULE_ID,
    title: MODULE_TITLE,
    openBrowser: () => NpcBrowser.show(),
    npcService,
    shopService,
    shop: shopApi,
    version: game.modules.get(MODULE_ID)?.version ?? "0.5.7"
  });
});

Hooks.on("getSceneControlButtons", (controls) => {
  try {
    registerTownForgeSceneControl(controls, () => NpcBrowser.show());
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to register scene control button`, error);
  }
});
