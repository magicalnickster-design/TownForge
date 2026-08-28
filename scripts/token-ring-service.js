import { MODULE_ID } from "./constants.js";

/** @type {Record<string, object>|null} */
let themeData = null;

/**
 * Load token theme definitions bundled with the module.
 * @returns {Promise<object>}
 */
export async function loadTokenThemes() {
  if (themeData) return themeData;
  const path = `modules/${MODULE_ID}/data/token-themes.json`;
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load token themes from ${path}`);
  themeData = await response.json();
  return themeData;
}

/**
 * Resolve a portrait-ring theme id for an NPC record.
 * @param {object} npc
 * @param {object} [catalog]
 * @returns {string}
 */
export function resolveTokenTheme(npc, catalog = themeData) {
  if (!npc || !catalog) return catalog?.defaultTheme ?? "commoner";

  const overrides = catalog.overrides ?? {};
  if (overrides[npc.id]) return overrides[npc.id];

  const tags = new Set((npc.tags ?? []).map((t) => String(t).toLowerCase()));
  const occupation = String(npc.occupation ?? "");
  const category = String(npc.category ?? "").toLowerCase();

  for (const rule of catalog.rules ?? []) {
    if (rule.tags?.some((tag) => tags.has(String(tag).toLowerCase()))) {
      return rule.theme;
    }
    if (rule.occupations?.includes(occupation)) {
      return rule.theme;
    }
    if (rule.categories?.includes(category)) {
      return rule.theme;
    }
  }

  return catalog.defaultTheme ?? "commoner";
}

/**
 * @param {string} themeId
 * @param {object} [catalog]
 * @returns {object}
 */
export function getTokenTheme(themeId, catalog = themeData) {
  return catalog?.themes?.[themeId] ?? catalog?.themes?.[catalog.defaultTheme] ?? {};
}

/**
 * Foundry Dynamic Token Ring effect bitmask.
 * @param {object} theme
 * @returns {number}
 */
export function buildRingEffects(theme) {
  const fx = foundry?.canvas?.placeables?.tokens?.TokenRing?.effects;
  if (!fx) return 1;

  let mask = fx.ENABLED ?? 1;
  if (theme?.pulse) {
    mask |= fx.RING_PULSE ?? 2;
    mask |= fx.RING_GRADIENT ?? 4;
    mask |= fx.BKG_WAVE ?? 8;
  }
  return mask;
}

/**
 * Build prototype token ring settings for portrait-based dynamic tokens.
 * @param {object} npc
 * @param {string} portraitPath Resolved portrait asset path
 * @param {object} [catalog]
 * @returns {object}
 */
export function buildPortraitRingToken(npc, portraitPath, catalog = themeData) {
  const themeId = resolveTokenTheme(npc, catalog);
  const theme = getTokenTheme(themeId, catalog);

  return {
    lockRotation: true,
    texture: {
      src: portraitPath
    },
    ring: {
      enabled: 1,
      colors: {
        ring: theme.ring ?? "#8f9aa3",
        background: theme.background ?? "#101214"
      },
      effects: buildRingEffects(theme),
      subject: {
        texture: portraitPath,
        scale: 1
      }
    },
    flags: {
      [MODULE_ID]: {
        tokenTheme: themeId
      }
    }
  };
}
