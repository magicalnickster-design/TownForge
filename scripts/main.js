import { LOG_PREFIX, MODULE_ID, MODULE_TITLE } from "./constants.js";
import { NpcBrowser } from "./npc-browser.js";
import { npcService } from "./npc-service.js";

/**
 * TownForge module entrypoint.
 *
 * - preload Free NPC data
 * - register a GM-only Scene Controls button
 * - expose a small API for future Free/Pro / auth features
 */

Hooks.once("init", () => {
  console.log(`${LOG_PREFIX} Initializing ${MODULE_TITLE} v0.1`);
});

Hooks.once("ready", async () => {
  try {
    await npcService.ready();
  } catch (error) {
    console.error(`${LOG_PREFIX} Ready hook failed while loading NPC library`, error);
  }

  console.log(`${LOG_PREFIX} Module ready`);

  // Lightweight public API; Free/Pro auth hooks can attach later.
  globalThis.townforge = Object.freeze({
    id: MODULE_ID,
    title: MODULE_TITLE,
    openBrowser: () => NpcBrowser.show(),
    npcService,
    version: game.modules.get(MODULE_ID)?.version ?? "0.1.0"
  });
});

/**
 * Foundry v13+ Scene Controls use a keyed Record, not an array.
 * Add a GM-only button tool under the Tokens control.
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
