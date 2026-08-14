import { LOG_PREFIX, MODULE_ID, MODULE_TITLE } from "./constants.js";
import { NpcBrowser } from "./npc-browser.js";
import { npcService } from "./npc-service.js";
import { registerTownForgeSettings } from "./settings.js";
import { registerShopHooks, shopApi } from "./shop-hooks.js";
import { shopService } from "./shop-service.js";

/**
 * TownForge module entrypoint.
 */

Hooks.once("init", () => {
  console.log(`${LOG_PREFIX} Initializing ${MODULE_TITLE} v${game.modules.get(MODULE_ID)?.version ?? "0.4.5"}`);
  registerTownForgeSettings();
});

Hooks.once("ready", async () => {
  try {
    await npcService.ready();
  } catch (error) {
    console.error(`${LOG_PREFIX} Ready hook failed while loading NPC library`, error);
  }

  registerShopHooks();
  console.log(`${LOG_PREFIX} Module ready`);

  globalThis.townforge = Object.freeze({
    id: MODULE_ID,
    title: MODULE_TITLE,
    openBrowser: () => NpcBrowser.show(),
    npcService,
    shopService,
    shop: shopApi,
    version: game.modules.get(MODULE_ID)?.version ?? "0.4.5"
  });
});

/**
 * Foundry v13+ Scene Controls use a keyed Record, not an array.
 */
Hooks.on("getSceneControlButtons", (controls) => {
  const tokens = controls.tokens;
  if (!tokens?.tools) {
    console.warn(`${LOG_PREFIX} Token scene controls unavailable; browser button not registered`);
    return;
  }

  tokens.tools.townforge = {
    name: "townforge",
    title: MODULE_TITLE,
    icon: "fa-solid fa-people-group",
    button: true,
    visible: Boolean(game.user?.isGM),
    order: Object.keys(tokens.tools).length,
    onChange: () => {
      void NpcBrowser.show();
    }
  };
});
