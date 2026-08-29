import { LOG_PREFIX } from "./constants.js";
import { DND5E_ITEM_PACK_CANDIDATES } from "./shop-constants.js";

const DND5E_SPELL_PACK_CANDIDATES = Object.freeze([
  "dnd5e.spells",
  "dnd5e.spells24"
]);

const DND5E_CLASS_PACK_CANDIDATES = Object.freeze([
  "dnd5e.classes",
  "dnd5e.classes24"
]);

/**
 * Normalize a compendium name or slug for fuzzy matching.
 * @param {unknown} value
 * @returns {string}
 */
export function toCompendiumSlug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Collapse slug punctuation so "calligrapher-s-supplies" matches "calligraphers-supplies".
 * @param {unknown} value
 * @returns {string}
 */
export function collapseCompendiumSlug(value) {
  return toCompendiumSlug(value).replace(/-/g, "");
}

/**
 * @param {string} uuid
 * @returns {{packId: string, docId: string, slug: string}|null}
 */
export function parseCompendiumUuid(uuid) {
  const parts = String(uuid).split(".");
  if (parts[0] !== "Compendium" || parts.length < 4) return null;
  const docId = parts.slice(3).join(".");
  return {
    packId: `${parts[1]}.${parts[2]}`,
    docId,
    slug: toCompendiumSlug(docId)
  };
}

/**
 * @param {string} packId
 * @returns {"Item"|"Spell"}
 */
export function inferDocumentNameFromPackId(packId) {
  const id = String(packId ?? "").toLowerCase();
  if (id.includes("spell")) return "Spell";
  return "Item";
}

/**
 * @param {object} entry
 * @param {{docId?: string, slug?: string, name?: string}} match
 * @returns {boolean}
 */
export function matchesCompendiumIndexEntry(entry, match) {
  if (!entry || !match) return false;
  if (match.docId && entry._id === match.docId) return true;

  const entrySlug = toCompendiumSlug(entry.name);
  if (match.slug && entrySlug === match.slug) return true;
  if (match.slug && collapseCompendiumSlug(entry.name) === collapseCompendiumSlug(match.slug)) {
    return true;
  }

  if (match.name) {
    const target = String(match.name).trim().toLowerCase();
    if (String(entry.name ?? "").trim().toLowerCase() === target) return true;
    if (entrySlug === toCompendiumSlug(match.name)) return true;
  }

  return false;
}

/**
 * @param {"Item"|"Spell"} documentName
 * @param {string|undefined} hintedPackId
 * @returns {CompendiumCollection[]}
 */
export function listCandidatePacks(documentName, hintedPackId) {
  const preferredIds = [];
  if (documentName === "Spell") {
    preferredIds.push(...DND5E_SPELL_PACK_CANDIDATES);
  } else if (hintedPackId && String(hintedPackId).toLowerCase().includes("class")) {
    preferredIds.push(...DND5E_CLASS_PACK_CANDIDATES);
  } else {
    preferredIds.push(...DND5E_ITEM_PACK_CANDIDATES);
  }
  if (hintedPackId) preferredIds.unshift(hintedPackId);

  const seen = new Set();
  const packs = [];

  const addPack = (pack) => {
    if (!pack) return;
    const id = pack.collection ?? pack.metadata?.id ?? pack.id;
    if (!id || seen.has(id)) return;
    const docName = pack.documentName ?? pack.metadata?.type;
    if (documentName && docName !== documentName) return;
    seen.add(id);
    packs.push(pack);
  };

  for (const id of preferredIds) addPack(game.packs?.get(id));
  for (const pack of game.packs ?? []) addPack(pack);

  return packs.sort((a, b) => {
    const aId = String(a.collection ?? a.id ?? "");
    const bId = String(b.collection ?? b.id ?? "");
    const aSystem = aId.startsWith("dnd5e.");
    const bSystem = bId.startsWith("dnd5e.");
    if (aSystem !== bSystem) return aSystem ? -1 : 1;
    const aPreferred = preferredIds.indexOf(aId);
    const bPreferred = preferredIds.indexOf(bId);
    if (aPreferred !== -1 || bPreferred !== -1) {
      if (aPreferred === -1) return 1;
      if (bPreferred === -1) return -1;
      return aPreferred - bPreferred;
    }
    return aId.localeCompare(bId);
  });
}

/**
 * @param {CompendiumCollection} pack
 * @param {{docId?: string, slug?: string, name?: string}} match
 * @returns {Promise<Document|undefined>}
 */
export async function getDocumentFromPack(pack, match) {
  if (!pack || !match) return undefined;

  if (match.docId) {
    const direct = await pack.getDocument(match.docId).catch(() => null);
    if (direct) return direct;
  }

  const index = pack.index?.length ? pack.index : await pack.getIndex?.().catch(() => []);
  const entry = index.find((row) => matchesCompendiumIndexEntry(row, match));
  if (!entry) return undefined;
  return pack.getDocument(entry._id).catch(() => null);
}

/**
 * Resolve a compendium UUID with multi-pack fallbacks for slug-style ids.
 * @param {string} uuid
 * @param {{documentName?: "Item"|"Spell", name?: string}} [options]
 * @returns {Promise<Document|undefined>}
 */
export async function resolveCompendiumDocument(uuid, options = {}) {
  if (typeof fromUuid === "function") {
    const direct = await fromUuid(uuid).catch(() => null);
    if (direct) return direct;
  }

  const parsed = parseCompendiumUuid(uuid);
  if (!parsed) return undefined;

  const documentName = options.documentName ?? inferDocumentNameFromPackId(parsed.packId);
  const match = {
    docId: parsed.docId,
    slug: parsed.slug,
    name: options.name
  };

  for (const pack of listCandidatePacks(documentName, parsed.packId)) {
    const doc = await getDocumentFromPack(pack, match);
    if (doc) return doc;
  }

  return undefined;
}

/**
 * Import a dnd5e class item from compendium packs when possible.
 * @param {object} stub
 * @returns {Promise<object>}
 */
/**
 * Find an Item document by exact or close display name across installed packs.
 * @param {string} name
 * @param {"Item"|"Spell"} [documentName]
 * @returns {Promise<Item|undefined>}
 */
export async function findCompendiumItemByName(name, documentName = "Item") {
  const target = String(name ?? "").trim();
  if (!target) return undefined;

  const slug = toCompendiumSlug(target);
  const targetLower = target.toLowerCase();

  for (const pack of listCandidatePacks(documentName)) {
    const direct = await getDocumentFromPack(pack, { slug, name: target });
    if (direct && String(direct.name ?? "").trim().toLowerCase() === targetLower) return direct;

    const index = pack.index?.length ? pack.index : await pack.getIndex?.().catch(() => []);
    const exact =
      index.find((row) => String(row.name ?? "").trim().toLowerCase() === targetLower) ?? null;
    if (exact) return pack.getDocument(exact._id).catch(() => null);

    const collapsedTarget = collapseCompendiumSlug(target);
    const collapsed =
      index.find(
        (row) =>
          collapseCompendiumSlug(row.name) === collapsedTarget ||
          String(row.name ?? "")
            .trim()
            .toLowerCase()
            .startsWith(targetLower)
      ) ?? null;
    if (collapsed) return pack.getDocument(collapsed._id).catch(() => null);
  }

  return undefined;
}

export async function resolveClassItemStub(stub) {
  const identifier = String(stub?.system?.identifier ?? toCompendiumSlug(stub?.name)).trim();
  const name = stub?.name;
  const level = Number(stub?.system?.levels) || 1;

  for (const packId of DND5E_CLASS_PACK_CANDIDATES) {
    const pack = game.packs?.get(packId);
    if (!pack) continue;

    const index = pack.index?.length ? pack.index : await pack.getIndex?.().catch(() => []);
    const entry =
      index.find((row) => {
        if (row.type && row.type !== "class") return false;
        const rowIdentifier = String(
          row.system?.identifier ?? row.identifier ?? toCompendiumSlug(row.name)
        ).trim();
        if (identifier && rowIdentifier === identifier) return true;
        return matchesCompendiumIndexEntry(row, { name, slug: toCompendiumSlug(identifier) });
      }) ?? null;

    if (!entry) continue;

    const doc = await pack.getDocument(entry._id).catch(() => null);
    if (!doc) continue;

    const itemData = doc.toObject ? doc.toObject() : foundry.utils.deepClone(doc);
    delete itemData._id;
    foundry.utils.setProperty(itemData, "system.levels", level);
    return itemData;
  }

  console.warn(
    `${LOG_PREFIX} Class compendium entry not found for "${name ?? identifier}"; using inline stub`
  );
  return foundry.utils.deepClone(stub);
}
