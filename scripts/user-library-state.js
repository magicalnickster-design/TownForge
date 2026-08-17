/** Favorites / recently-used helpers (Foundry I/O at the bottom for Node tests). */

import { MODULE_ID, RECENT_NPC_LIMIT as RECENT_LIMIT } from "./constants.js";

export const USER_FLAGS = Object.freeze({
  FAVORITES: "favorites",
  RECENT_NPCS: "recentNPCs"
});

export const RECENT_NPC_LIMIT = RECENT_LIMIT;

export const LIBRARY_FILTERS = Object.freeze({
  FAVORITES: "favorites",
  RECENT: "recent"
});

/**
 * Sanitize a favorites list into unique string NPC ids.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeFavorites(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const result = [];
  for (const entry of raw) {
    const id = typeof entry === "string" ? entry.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Sanitize recent NPC history.
 * Accepts [{id, lastUsed}] or legacy string ids.
 * @param {unknown} raw
 * @param {number} [limit]
 * @returns {{id: string, lastUsed: number}[]}
 */
export function normalizeRecent(raw, limit = RECENT_NPC_LIMIT) {
  if (!Array.isArray(raw)) return [];
  const byId = new Map();

  for (const entry of raw) {
    if (typeof entry === "string") {
      const id = entry.trim();
      if (!id) continue;
      const prev = byId.get(id);
      const lastUsed = prev?.lastUsed ?? 0;
      byId.set(id, { id, lastUsed });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id) continue;
    const lastUsed = Number(entry.lastUsed);
    const stamp = Number.isFinite(lastUsed) ? lastUsed : 0;
    const prev = byId.get(id);
    if (!prev || stamp >= prev.lastUsed) {
      byId.set(id, { id, lastUsed: stamp });
    }
  }

  return [...byId.values()]
    .sort((a, b) => b.lastUsed - a.lastUsed || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}

/**
 * Toggle an NPC id in favorites.
 * @param {string[]} favorites
 * @param {string} npcId
 * @returns {{favorites: string[], favorited: boolean}}
 */
export function toggleFavoriteId(favorites, npcId) {
  const id = String(npcId ?? "").trim();
  const current = normalizeFavorites(favorites);
  if (!id) return { favorites: current, favorited: false };
  if (current.includes(id)) {
    return {
      favorites: current.filter((entry) => entry !== id),
      favorited: false
    };
  }
  return { favorites: [...current, id], favorited: true };
}

/**
 * Record/update a recently used NPC id.
 * @param {{id:string,lastUsed:number}[]} recent
 * @param {string} npcId
 * @param {number} [timestamp]
 * @param {number} [limit]
 * @returns {{id:string,lastUsed:number}[]}
 */
export function recordRecentNpcId(recent, npcId, timestamp = Date.now(), limit = RECENT_NPC_LIMIT) {
  const id = String(npcId ?? "").trim();
  const stamp = Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.now();
  const current = normalizeRecent(recent, Number.POSITIVE_INFINITY);
  if (!id) return normalizeRecent(current, limit);
  const next = current.filter((entry) => entry.id !== id);
  next.unshift({ id, lastUsed: stamp });
  return normalizeRecent(next, limit);
}

/**
 * Drop ids that are not present in the known NPC id set.
 * @param {string[]} favorites
 * @param {Set<string>|string[]} knownIds
 * @returns {string[]}
 */
export function pruneFavorites(favorites, knownIds) {
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds ?? []);
  return normalizeFavorites(favorites).filter((id) => known.has(id));
}

/**
 * @param {{id:string,lastUsed:number}[]} recent
 * @param {Set<string>|string[]} knownIds
 * @param {number} [limit]
 * @returns {{id:string,lastUsed:number}[]}
 */
export function pruneRecent(recent, knownIds, limit = RECENT_NPC_LIMIT) {
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds ?? []);
  return normalizeRecent(recent, Number.POSITIVE_INFINITY)
    .filter((entry) => known.has(entry.id))
    .slice(0, Math.max(0, limit));
}

/**
 * Filter + order NPCs for favorites / recent library views.
 * @param {object[]} npcs
 * @param {{mode: "favorites"|"recent"|"category"|"all", query?: string, favoriteIds?: string[], recentEntries?: {id:string,lastUsed:number}[], category?: string}} options
 * @returns {object[]}
 */
export function filterLibraryNpcs(npcs, options = {}) {
  const list = Array.isArray(npcs) ? npcs : [];
  const query = String(options.query ?? "").trim().toLowerCase();
  const mode = options.mode || "all";
  const favoriteSet = new Set(normalizeFavorites(options.favoriteIds));
  const recent = normalizeRecent(options.recentEntries, Number.POSITIVE_INFINITY);
  const recentRank = new Map(recent.map((entry, index) => [entry.id, index]));

  let result = list.slice();

  if (mode === LIBRARY_FILTERS.FAVORITES) {
    result = result.filter((npc) => favoriteSet.has(npc.id));
  } else if (mode === LIBRARY_FILTERS.RECENT) {
    result = result.filter((npc) => recentRank.has(npc.id));
  } else if (mode !== "all" && options.category && options.category !== "all") {
    result = result.filter((npc) => npc.category === options.category);
  }

  if (query) {
    result = result.filter((npc) => {
      const haystack = [
        npc.name,
        npc.species,
        npc.occupation,
        npc.category,
        npc.description,
        npc.gender,
        ...(npc.tags ?? [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  return result;
}

/**
 * Sort NPCs with optional recently-used ranking.
 * @param {object[]} npcs
 * @param {"name-asc"|"name-desc"|"recent"|"occupation"|"category"} sort
 * @param {{id:string,lastUsed:number}[]} [recentEntries]
 * @returns {object[]}
 */
export function sortLibraryNpcs(npcs, sort = "name-asc", recentEntries = []) {
  const list = Array.isArray(npcs) ? npcs.slice() : [];
  const recent = normalizeRecent(recentEntries, Number.POSITIVE_INFINITY);
  const recentRank = new Map(recent.map((entry, index) => [entry.id, index]));

  const byNameAsc = (a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""));

  if (sort === "name-desc") {
    return list.sort((a, b) => byNameAsc(b, a));
  }

  if (sort === "occupation") {
    return list.sort(
      (a, b) =>
        String(a.occupation ?? "").localeCompare(String(b.occupation ?? "")) || byNameAsc(a, b)
    );
  }

  if (sort === "category") {
    return list.sort(
      (a, b) =>
        String(a.category ?? "").localeCompare(String(b.category ?? "")) || byNameAsc(a, b)
    );
  }

  if (sort === "recent") {
    return list.sort((a, b) => {
      const ar = recentRank.has(a.id) ? recentRank.get(a.id) : Number.POSITIVE_INFINITY;
      const br = recentRank.has(b.id) ? recentRank.get(b.id) : Number.POSITIVE_INFINITY;
      if (ar !== br) return ar - br;
      return byNameAsc(a, b);
    });
  }

  return list.sort(byNameAsc);
}

function moduleId() {
  return MODULE_ID;
}

/**
 * Read favorites from the active Foundry user.
 * @returns {string[]}
 */
export function loadUserFavorites() {
  try {
    const raw = game.user?.getFlag?.(moduleId(), USER_FLAGS.FAVORITES);
    return normalizeFavorites(raw);
  } catch (_error) {
    return [];
  }
}

/**
 * @param {string[]} favorites
 * @returns {Promise<string[]>}
 */
export async function saveUserFavorites(favorites) {
  const next = normalizeFavorites(favorites);
  if (!game.user) return next;
  await game.user.setFlag(moduleId(), USER_FLAGS.FAVORITES, next);
  return next;
}

/**
 * @returns {{id:string,lastUsed:number}[]}
 */
export function loadUserRecent() {
  try {
    const raw = game.user?.getFlag?.(moduleId(), USER_FLAGS.RECENT_NPCS);
    return normalizeRecent(raw);
  } catch (_error) {
    return [];
  }
}

/**
 * @param {{id:string,lastUsed:number}[]} recent
 * @returns {Promise<{id:string,lastUsed:number}[]>}
 */
export async function saveUserRecent(recent) {
  const next = normalizeRecent(recent);
  if (!game.user) return next;
  await game.user.setFlag(moduleId(), USER_FLAGS.RECENT_NPCS, next);
  return next;
}

/**
 * Toggle favorite for current user and persist.
 * @param {string} npcId
 * @returns {Promise<{favorites: string[], favorited: boolean}>}
 */
export async function toggleUserFavorite(npcId) {
  const current = loadUserFavorites();
  const result = toggleFavoriteId(current, npcId);
  await saveUserFavorites(result.favorites);
  return result;
}

/**
 * Record a successful Import / Add-to-Scene for the current user.
 * @param {string} npcId
 * @returns {Promise<{id:string,lastUsed:number}[]>}
 */
export async function recordUserRecentNpc(npcId) {
  const next = recordRecentNpcId(loadUserRecent(), npcId, Date.now());
  return saveUserRecent(next);
}
