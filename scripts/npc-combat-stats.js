/** @typedef {import("./actor-service.js").ActorService} ActorService */

const HIT_DICE = {
  barbarian: 12,
  fighter: 10,
  paladin: 10,
  ranger: 10,
  bard: 8,
  cleric: 8,
  rogue: 8,
  monk: 8,
  warlock: 8,
  wizard: 6,
  sorcerer: 6,
  commoner: 4
};

/**
 * @param {number} score
 */
function abilityMod(score) {
  return Math.floor((Number(score) - 10) / 2);
}

/**
 * Max-hit-die HP per level — mirrors tools/npc_combat_loadouts.py.
 * @param {string} classId
 * @param {number} level
 * @param {number} conScore
 */
export function estimateNpcHp(classId, level, conScore) {
  const die = HIT_DICE[classId] ?? 8;
  const conMod = abilityMod(conScore);
  const perLevel = Math.max(1, die + conMod);
  return Math.max(1, Math.floor(Number(level) || 1) * perLevel);
}

/**
 * Build actor update data for HP/AC/prof/level from a TownForge NPC record.
 * @param {object} npc
 */
export function buildNpcCombatStatUpdates(npc) {
  const system = npc?.actorData?.system ?? {};
  const abilities = system.abilities ?? {};
  const attrs = system.attributes ?? {};
  const details = system.details ?? {};
  const classItem = (npc?.actorData?.items ?? []).find((item) => item?.type === "class");
  const classId = classItem?.system?.identifier ?? "commoner";
  const level = Number(classItem?.system?.levels ?? details.level ?? 1) || 1;
  const con = Number(abilities.con?.value ?? 10);

  const hpMax = estimateNpcHp(classId, level, con);
  const updates = {
    "system.attributes.hp.max": hpMax,
    "system.attributes.hp.value": hpMax,
    "system.details.level": level
  };

  const prof = attrs.prof;
  if (Number.isFinite(prof)) updates["system.attributes.prof"] = prof;

  const ac = attrs.ac?.flat;
  if (Number.isFinite(ac)) {
    updates["system.attributes.ac.flat"] = ac;
    updates["system.attributes.ac.calc"] = "flat";
  }

  const cr = details.cr;
  if (Number.isFinite(cr)) updates["system.details.cr"] = cr;

  return updates;
}
