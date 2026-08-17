import { MODULE_ID } from "./constants.js";
import { DND5E_ITEM_PACK_CANDIDATES } from "./shop-constants.js";

/** World setting key for selected shop item compendium pack IDs. */
export const SHOP_ITEM_SOURCES_SETTING = "shopItemSources";

/**
 * Resolve configured Item pack IDs from the world setting.
 */
export function resolveConfiguredSourceIds(settingsValue, options = {}) {
  void options.shopType;
  if (Array.isArray(settingsValue)) {
    return settingsValue.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim());
  }
  if (settingsValue && typeof settingsValue === "object") {
    const typed = settingsValue.byShopType?.[options.shopType];
    if (Array.isArray(typed) && typed.length) {
      return typed.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim());
    }
    if (Array.isArray(settingsValue.default)) {
      return settingsValue.default
        .filter((id) => typeof id === "string" && id.trim())
        .map((id) => id.trim());
    }
  }
  return [];
}

/**
 * Keep only pack IDs that still exist and are Item document packs.
 * @param {string[]} selectedIds
 * @param {{id:string, documentName:string}[]} availablePacks
 * @returns {string[]}
 */
export function sanitizeSelectedPackIds(selectedIds, availablePacks = []) {
  const available = new Set(
    (availablePacks ?? [])
      .filter((pack) => pack && pack.documentName === "Item" && typeof pack.id === "string")
      .map((pack) => pack.id)
  );
  const seen = new Set();
  const result = [];
  for (const id of selectedIds ?? []) {
    if (typeof id !== "string" || !id.trim()) continue;
    const clean = id.trim();
    if (!available.has(clean) || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
  }
  return result;
}

/**
 * @param {{id:string, documentName:string}} pack
 * @returns {boolean}
 */
export function isSelectableItemPack(pack) {
  return Boolean(pack && pack.documentName === "Item" && typeof pack.id === "string" && pack.id);
}

/**
 * Filter packs to those selected by the GM.
 * Unselected packs are ignored. Non-Item packs never pass.
 * @param {{id:string, documentName:string, [key:string]: any}[]} packs
 * @param {string[]} selectedIds
 * @returns {object[]}
 */
export function filterPacksBySelection(packs, selectedIds) {
  const selected = new Set(sanitizeSelectedPackIds(selectedIds, packs));
  return (packs ?? []).filter((pack) => isSelectableItemPack(pack) && selected.has(pack.id));
}

/**
 * Recommended starter pack IDs among those currently installed.
 * @param {{id:string}[]} availablePacks
 * @returns {string[]}
 */
export function recommendedPackIds(availablePacks = []) {
  const installed = new Set((availablePacks ?? []).map((pack) => pack.id));
  return DND5E_ITEM_PACK_CANDIDATES.filter((id) => installed.has(id));
}

/**
 * Map installed Item packs for the settings UI / shop generation.
 *
 * @param {Iterable} packs
 * @returns {{id:string, label:string, packageName:string, packageType:string, documentName:string}[]}
 */
export function mapDiscoverableItemPacks(packs) {
  const list = [];
  for (const pack of packs ?? []) {
    const id = pack?.collection ?? pack?.metadata?.id ?? pack?.id;
    const documentName = pack?.documentName ?? pack?.metadata?.type;
    if (!id || documentName !== "Item") continue;

    const packageName =
      pack?.metadata?.packageName ??
      pack?.metadata?.package ??
      String(id).split(".")[0] ??
      "unknown";
    const packageType = pack?.metadata?.packageType ?? inferPackageType(packageName);
    const label = pack?.metadata?.label ?? pack?.title ?? id;

    list.push({
      id,
      label,
      packageName,
      packageType,
      documentName: "Item",
      sourceLabel: formatSourceLabel(packageName, packageType)
    });
  }

  return list.sort((a, b) => {
    const pkg = String(a.packageName).localeCompare(String(b.packageName));
    if (pkg !== 0) return pkg;
    return String(a.label).localeCompare(String(b.label));
  });
}

function inferPackageType(packageName) {
  if (packageName === "dnd5e") return "system";
  if (packageName === "world") return "world";
  return "module";
}

function formatSourceLabel(packageName, packageType) {
  if (packageType === "system") return `System: ${packageName}`;
  if (packageType === "world") return "World";
  return `Module: ${packageName}`;
}

/**
 * Read + sanitize the live TownForge world setting.
 * @returns {string[]}
 */
export function getSavedShopItemSourceIds() {
  try {
    const raw = game.settings.get(MODULE_ID, SHOP_ITEM_SOURCES_SETTING);
    return resolveConfiguredSourceIds(raw);
  } catch (_error) {
    return [];
  }
}

/**
 * Discover Item packs currently available in this Foundry world.
 * @returns {{id:string, label:string, packageName:string, packageType:string, documentName:string, sourceLabel:string}[]}
 */
export function discoverInstalledItemPacks() {
  return mapDiscoverableItemPacks(game.packs ?? []);
}

/**
 * Resolve Foundry CompendiumCollection objects for shop generation.
 * Does not fall back to all packs when none are selected.
 * @returns {{packs: CompendiumCollection[], selectedIds: string[], missingIds: string[]}}
 */
export function resolveSelectedItemPacks() {
  const configured = getSavedShopItemSourceIds();
  const discovered = discoverInstalledItemPacks();
  const validIds = sanitizeSelectedPackIds(configured, discovered);
  const validSet = new Set(validIds);
  const missingIds = configured.filter((id) => !validSet.has(id));

  const packs = [];
  for (const id of validIds) {
    const pack = game.packs.get(id);
    if (!pack || pack.documentName !== "Item") continue;
    packs.push(pack);
  }

  return { packs, selectedIds: validIds, missingIds };
}
