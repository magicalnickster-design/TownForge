import { LOG_PREFIX, MODULE_TITLE } from "./constants.js";

/**
 * Register the TownForge NPC browser button on the token scene controls.
 * @param {Record<string, object>} controls
 * @param {() => Promise<unknown>|unknown} openBrowser
 */
export function registerTownForgeSceneControl(controls, openBrowser) {
  const tokenLayer = controls?.tokens ?? controls?.token;
  if (!tokenLayer) {
    console.warn(`${LOG_PREFIX} Token scene controls unavailable; browser button not registered`);
    return false;
  }

  if (!tokenLayer.tools || typeof tokenLayer.tools !== "object") {
    tokenLayer.tools = {};
  }

  const order =
    Object.keys(tokenLayer.tools).length +
    (tokenLayer.tools.townforge ? 0 : 1);

  tokenLayer.tools.townforge = {
    name: "townforge",
    title: MODULE_TITLE,
    icon: "fa-solid fa-people-group",
    button: true,
    active: false,
    visible: Boolean(game.user?.isGM),
    order,
    onChange: () => {
      void openBrowser();
    }
  };

  return true;
}
