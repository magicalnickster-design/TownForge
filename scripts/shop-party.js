/**
 * Party-Aware Inventory helpers for TownForge shop generation.
 * Pure enough for Node unit tests — callers inject users/actors when needed.
 */

export const PARTY_DETECTION_MODES = Object.freeze({
  auto: "auto",
  manual: "manual"
});

/** Relative generation weights (shop-type filter still gates eligibility). */
export const PARTY_WEIGHTS = Object.freeze({
  relevantMin: 2,
  relevantMax: 4,
  general: 1,
  specialistLow: 0.4
});

/**
 * Central class → item relevance signals.
 * Expand here for subclasses / tags later — do not scatter class checks in the generator.
 */
export const CLASS_RELEVANCE = Object.freeze({
  barbarian: {
    itemTypes: ["weapon", "equipment"],
    armorTypes: ["light", "medium", "shield"],
    weaponTypes: ["simpleM", "martialM", "simpleR", "martialR"],
    nameIncludes: ["greataxe", "greatsword", "javelin", "handaxe"],
    specialist: true
  },
  bard: {
    itemTypes: ["weapon", "tool", "equipment", "consumable"],
    armorTypes: ["light", "shield"],
    weaponTypes: ["simpleM", "simpleR", "martialM"],
    nameIncludes: ["instrument", "lute", "flute", "lyre", "drum", "horn", "viol", "bagpipes"],
    toolTypes: ["music", "instrument"],
    specialist: true
  },
  cleric: {
    itemTypes: ["weapon", "equipment", "consumable"],
    armorTypes: ["light", "medium", "heavy", "shield"],
    weaponTypes: ["simpleM", "simpleR"],
    nameIncludes: ["holy symbol", "symbol", "prayer", "healer", "potion of healing", "amulet"],
    specialist: true
  },
  druid: {
    itemTypes: ["weapon", "equipment", "consumable"],
    armorTypes: ["light", "medium", "shield"],
    weaponTypes: ["simpleM", "simpleR"],
    nameIncludes: ["herbalism", "druidic", "scimitar", "staff", "totem", "mistletoe"],
    specialist: true
  },
  fighter: {
    itemTypes: ["weapon", "equipment"],
    armorTypes: ["light", "medium", "heavy", "shield"],
    weaponTypes: ["simpleM", "martialM", "simpleR", "martialR"],
    nameIncludes: ["sword", "axe", "maul", "halberd", "crossbow", "shield", "plate", "mail"],
    specialist: false
  },
  monk: {
    itemTypes: ["weapon", "equipment"],
    armorTypes: ["light"],
    weaponTypes: ["simpleM", "simpleR", "martialM"],
    nameIncludes: ["shortsword", "dart", "quarterstaff", "monk"],
    specialist: true
  },
  paladin: {
    itemTypes: ["weapon", "equipment", "consumable"],
    armorTypes: ["light", "medium", "heavy", "shield"],
    weaponTypes: ["simpleM", "martialM", "simpleR", "martialR"],
    nameIncludes: ["holy symbol", "symbol", "longsword", "warhammer", "plate"],
    specialist: true
  },
  ranger: {
    itemTypes: ["weapon", "equipment", "consumable", "tool"],
    armorTypes: ["light", "medium", "shield"],
    weaponTypes: ["simpleM", "martialM", "simpleR", "martialR"],
    nameIncludes: ["longbow", "shortbow", "arrow", "hunter", "survival"],
    specialist: false
  },
  rogue: {
    itemTypes: ["weapon", "tool", "equipment"],
    armorTypes: ["light"],
    weaponTypes: ["simpleM", "simpleR", "martialM", "martialR"],
    nameIncludes: ["thieves", "dagger", "shortsword", "rapier", "crossbow", "poison"],
    toolTypes: ["thief", "thieves"],
    specialist: true
  },
  sorcerer: {
    itemTypes: ["weapon", "equipment", "consumable"],
    armorTypes: [],
    weaponTypes: ["simpleM", "simpleR"],
    nameIncludes: ["arcane focus", "focus", "crystal", "orb", "wand", "staff", "rod", "scroll"],
    specialist: true
  },
  warlock: {
    itemTypes: ["weapon", "equipment", "consumable"],
    armorTypes: ["light"],
    weaponTypes: ["simpleM", "simpleR"],
    nameIncludes: ["arcane focus", "focus", "rod", "wand", "pact", "scroll", "orb", "crystal"],
    specialist: true
  },
  wizard: {
    itemTypes: ["weapon", "equipment", "consumable"],
    armorTypes: [],
    weaponTypes: ["simpleM", "simpleR"],
    nameIncludes: ["arcane focus", "focus", "wand", "staff", "scroll", "spellbook", "component", "orb", "crystal", "rod"],
    specialist: true
  },
  artificer: {
    itemTypes: ["weapon", "equipment", "tool", "consumable"],
    armorTypes: ["light", "medium", "shield"],
    weaponTypes: ["simpleM", "simpleR", "martialM", "martialR"],
    nameIncludes: ["tinker", "thieves", "tool", "firearm", "infusion"],
    toolTypes: ["artisan", "tinker", "smith", "thief"],
    specialist: true
  }
});

/**
 * @param {Iterable<object>|null|undefined} users
 * @param {(uuid: string) => object|null|undefined} resolveActor
 * @returns {object[]} unique character Actors
 */
export function detectAssignedPartyActors(users, resolveActor) {
  const seen = new Set();
  const party = [];
  for (const user of users ?? []) {
    if (!user || user.isGM) continue;
    const assigned = user.character;
    if (!assigned) continue;
    let actor = null;
    if (typeof assigned === "object" && assigned.type === "character") {
      actor = assigned;
    } else {
      actor = resolveActor?.(assigned.uuid ?? assigned.id ?? assigned) ?? null;
    }
    if (!actor || actor.type !== "character") continue;
    const key = actor.uuid || actor.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    party.push(actor);
  }
  return party;
}

/**
 * Resolve manual party Actor uuids, skipping missing docs.
 * @param {string[]} uuids
 * @param {(uuid: string) => object|null|undefined|Promise<object|null>} resolveActor
 * @returns {Promise<{actors: object[], missing: string[]}>}
 */
export async function resolveManualPartyActors(uuids, resolveActor) {
  const actors = [];
  const missing = [];
  const seen = new Set();
  for (const uuid of uuids ?? []) {
    const id = String(uuid || "").trim();
    if (!id) continue;
    let actor = null;
    try {
      actor = await resolveActor(id);
    } catch (_error) {
      actor = null;
    }
    if (!actor || actor.type !== "character") {
      missing.push(id);
      continue;
    }
    const key = actor.uuid || actor.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    actors.push(actor);
  }
  return { actors, missing };
}

/**
 * Extract class levels from a dnd5e character Actor.
 * Supports itemTypes.class / items of type "class" and system.details.level.
 * @param {object|null|undefined} actor
 * @returns {{name: string, uuid: string, totalLevel: number, classes: {id: string, name: string, levels: number}[]}}
 */
export function inspectCharacterClasses(actor) {
  const empty = {
    name: actor?.name || "Unknown",
    uuid: actor?.uuid || actor?.id || "",
    totalLevel: 1,
    classes: []
  };
  if (!actor || actor.type !== "character") return empty;

  /** @type {{id: string, name: string, levels: number}[]} */
  const classes = [];
  const classItems =
    actor.itemTypes?.class ??
    actor.items?.filter?.((item) => item.type === "class") ??
    [];

  for (const item of classItems) {
    const levels = Math.max(0, Math.floor(Number(item.system?.levels ?? item.system?.level ?? 0) || 0));
    if (levels <= 0) continue;
    const id = normalizeClassId(
      item.system?.identifier || item.identifier || item.name || item.id
    );
    classes.push({
      id,
      name: String(item.name || id),
      levels
    });
  }

  // Fallback: embedded system.classes map (older / alternate shapes).
  if (!classes.length && actor.system?.classes && typeof actor.system.classes === "object") {
    for (const [key, row] of Object.entries(actor.system.classes)) {
      const levels = Math.max(0, Math.floor(Number(row?.levels ?? row?.level ?? 0) || 0));
      if (levels <= 0) continue;
      const id = normalizeClassId(row?.identifier || key);
      classes.push({
        id,
        name: String(row?.name || key),
        levels
      });
    }
  }

  const classSum = classes.reduce((sum, row) => sum + row.levels, 0);
  const detailLevel = Math.max(
    0,
    Math.floor(
      Number(actor.system?.details?.level ?? actor.system?.details?.xp?.level ?? 0) || 0
    )
  );
  const totalLevel = Math.max(1, Math.min(20, classSum || detailLevel || 1));

  return {
    name: actor.name || "Unknown",
    uuid: actor.uuid || actor.id || "",
    totalLevel,
    classes
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeClassId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Build an ephemeral party profile for weighting.
 * @param {object[]} actors
 * @returns {{
 *   empty: boolean,
 *   averageLevel: number,
 *   maxLevel: number,
 *   classes: Record<string, number>,
 *   members: ReturnType<typeof inspectCharacterClasses>[],
 *   summary: string
 * }}
 */
export function buildPartyProfile(actors) {
  const members = (actors ?? []).map((actor) => inspectCharacterClasses(actor));
  if (!members.length) {
    return {
      empty: true,
      averageLevel: 1,
      maxLevel: 1,
      classes: {},
      members: [],
      summary: ""
    };
  }

  /** @type {Record<string, number>} */
  const classes = {};
  for (const member of members) {
    if (member.classes.length) {
      for (const row of member.classes) {
        classes[row.id] = (classes[row.id] || 0) + 1;
      }
    }
  }

  const levels = members.map((member) => member.totalLevel);
  const averageLevel = Math.max(
    1,
    Math.min(20, Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length))
  );
  const maxLevel = Math.max(1, Math.min(20, Math.max(...levels)));

  return {
    empty: false,
    averageLevel,
    maxLevel,
    classes,
    members,
    summary: formatPartyMemberSummary(members)
  };
}

/**
 * @param {ReturnType<typeof inspectCharacterClasses>[]} members
 * @returns {string}
 */
export function formatPartyMemberSummary(members) {
  return (members ?? [])
    .map((member) => {
      const classLabel = member.classes.length
        ? member.classes.map((row) => `${titleCase(row.name || row.id)} ${row.levels}`).join(" / ")
        : `Level ${member.totalLevel}`;
      return `${member.name} — ${classLabel}`;
    })
    .join(" • ");
}

/**
 * Compact class-only summary for the active banner.
 * @param {ReturnType<typeof buildPartyProfile>} profile
 * @returns {string}
 */
export function formatPartyClassBanner(profile) {
  if (!profile || profile.empty) return "";
  return (profile.members ?? [])
    .map((member) => {
      if (!member.classes.length) return `${titleCase(member.name)} ${member.totalLevel}`;
      return member.classes.map((row) => `${titleCase(row.id)} ${row.levels}`).join(" / ");
    })
    .join(" • ");
}

/**
 * Stable fingerprint for generationKey — recalculated, not persisted.
 * @param {ReturnType<typeof buildPartyProfile>} profile
 * @param {string} detectionMode
 * @param {string[]} manualUuids
 * @returns {string}
 */
export function partyProfileFingerprint(profile, detectionMode, manualUuids = []) {
  if (!profile || profile.empty) return `${detectionMode}:empty`;
  const classPart = Object.keys(profile.classes)
    .sort()
    .map((id) => `${id}:${profile.classes[id]}`)
    .join(",");
  const manualPart =
    detectionMode === PARTY_DETECTION_MODES.manual
      ? [...manualUuids].map(String).sort().join(",")
      : "";
  return `${detectionMode}:avg${profile.averageLevel}:max${profile.maxLevel}:${classPart}:${manualPart}`;
}

/**
 * Score an index/stock candidate for party relevance.
 * Returns a positive weight multiplier (never zero).
 * @param {object} item normalized index item
 * @param {ReturnType<typeof buildPartyProfile>|null|undefined} profile
 * @returns {number}
 */
export function scoreItemPartyWeight(item, profile) {
  if (!profile || profile.empty) return PARTY_WEIGHTS.general;
  if (!item) return PARTY_WEIGHTS.general;

  const partyClassIds = Object.keys(profile.classes);
  if (!partyClassIds.length) return PARTY_WEIGHTS.general;

  let bestRelevant = 0;
  let specialistMiss = false;

  for (const [classId, mapping] of Object.entries(CLASS_RELEVANCE)) {
    const inParty = partyClassIds.includes(classId);
    const matchStrength = scoreItemAgainstClass(item, mapping);
    if (matchStrength < 0.35) continue;

    if (inParty) {
      const presence = Math.min(3, profile.classes[classId] || 1);
      const boosted =
        PARTY_WEIGHTS.relevantMin +
        (PARTY_WEIGHTS.relevantMax - PARTY_WEIGHTS.relevantMin) *
          Math.min(1, matchStrength) *
          (0.65 + 0.35 * (presence / 3));
      bestRelevant = Math.max(bestRelevant, boosted);
    } else if (mapping.specialist && matchStrength >= 0.75) {
      specialistMiss = true;
    }
  }

  if (bestRelevant > 0) return roundWeight(bestRelevant);
  if (specialistMiss) return PARTY_WEIGHTS.specialistLow;
  return PARTY_WEIGHTS.general;
}

/**
 * @param {object} item
 * @param {object} mapping
 * @returns {number} 0–1 match strength
 */
export function scoreItemAgainstClass(item, mapping) {
  if (!item || !mapping) return 0;
  const type = String(item.type || "");
  const name = String(item.name || "").toLowerCase();
  const armorType = String(item.armorType || "").toLowerCase();
  const weaponType = String(item.weaponType || "").toLowerCase();
  const toolType = String(item.toolType || item.system?.type?.value || "").toLowerCase();

  let score = 0;
  let signals = 0;

  if (Array.isArray(mapping.itemTypes) && mapping.itemTypes.includes(type)) {
    score += 0.25;
    signals += 1;
  }

  if (type === "equipment" && armorType && mapping.armorTypes?.length) {
    if (mapping.armorTypes.includes(armorType) || mapping.armorTypes.includes("shield") && /shield/.test(name)) {
      score += 0.45;
      signals += 1;
    } else if (mapping.armorTypes.length === 0) {
      // Caster classes with empty armor list: armor is a miss, not a boost.
      score -= 0.2;
    }
  }

  if (type === "weapon" && weaponType && mapping.weaponTypes?.length) {
    if (mapping.weaponTypes.some((entry) => weaponType.includes(String(entry).toLowerCase()))) {
      score += 0.35;
      signals += 1;
    }
  }

  if (mapping.nameIncludes?.length) {
    if (mapping.nameIncludes.some((hint) => name.includes(String(hint).toLowerCase()))) {
      score += 0.55;
      signals += 1;
    }
  }

  if (type === "tool" && mapping.toolTypes?.length) {
    if (mapping.toolTypes.some((hint) => toolType.includes(hint) || name.includes(hint))) {
      score += 0.6;
      signals += 1;
    }
  }

  if (signals === 0) return 0;
  return Math.max(0, Math.min(1, score));
}

/**
 * @param {number} value
 * @returns {number}
 */
function roundWeight(value) {
  return Math.round(value * 100) / 100;
}

/**
 * @param {string} text
 * @returns {string}
 */
function titleCase(text) {
  return String(text || "")
    .split(/[\s_/]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Normalize shop party-aware fields from flags/form input.
 * @param {object} shop
 * @returns {{partyAwareInventory: boolean, partyDetectionMode: string, partyActorUuids: string[]}}
 */
export function normalizePartyAwareSettings(shop = {}) {
  const mode =
    shop.partyDetectionMode === PARTY_DETECTION_MODES.manual
      ? PARTY_DETECTION_MODES.manual
      : PARTY_DETECTION_MODES.auto;
  const uuids = Array.isArray(shop.partyActorUuids)
    ? [...new Set(shop.partyActorUuids.map((id) => String(id || "").trim()).filter(Boolean))]
    : [];
  return {
    partyAwareInventory: Boolean(shop.partyAwareInventory),
    partyDetectionMode: mode,
    partyActorUuids: uuids
  };
}
