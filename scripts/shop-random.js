/**
 * Seeded / random picks for shop stock.
 */

export function stableHash(text) {
  let hash = 2166136261;
  const str = String(text ?? "");
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Seeded shuffle-and-take.
 * @template T
 * @param {T[]} list
 * @param {number} count
 * @param {string} seedText
 * @returns {T[]}
 */
export function seededPick(list, count, seedText) {
  if (!Array.isArray(list) || !list.length || count <= 0) return [];
  const arr = list.slice();
  let seed = stableHash(seedText);
  seed = Number.parseInt(String(seed).slice(0, 8), 16) || 1;
  const rand = () => {
    seed = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(count, arr.length));
}

/**
 * Non-deterministic shuffle-and-take for Regenerate clicks.
 * @template T
 * @param {T[]} list
 * @param {number} count
 * @returns {T[]}
 */
export function randomPick(list, count) {
  if (!Array.isArray(list) || !list.length || count <= 0) return [];
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(count, arr.length));
}

/**
 * Weighted pick without replacement (seeded).
 * @template T
 * @param {T[]} list
 * @param {number} count
 * @param {(item: T) => number} weightFn
 * @param {string} seedText
 * @returns {T[]}
 */
export function weightedSeededPick(list, count, weightFn, seedText) {
  return weightedPick(list, count, weightFn, seededRng(seedText));
}

/**
 * Weighted pick without replacement (random).
 * @template T
 * @param {T[]} list
 * @param {number} count
 * @param {(item: T) => number} weightFn
 * @returns {T[]}
 */
export function weightedRandomPick(list, count, weightFn) {
  return weightedPick(list, count, weightFn, Math.random);
}

/**
 * @param {string} seedText
 * @returns {() => number}
 */
function seededRng(seedText) {
  let seed = Number.parseInt(String(stableHash(seedText)).slice(0, 8), 16) || 1;
  return () => {
    seed = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
}

/**
 * @template T
 * @param {T[]} list
 * @param {number} count
 * @param {(item: T) => number} weightFn
 * @param {() => number} rand
 * @returns {T[]}
 */
function weightedPick(list, count, weightFn, rand) {
  if (!Array.isArray(list) || !list.length || count <= 0) return [];
  const remaining = list.map((item, index) => ({
    item,
    index,
    weight: Math.max(0.0001, Number(weightFn?.(item) ?? 1) || 1)
  }));
  const picked = [];
  const target = Math.min(count, remaining.length);
  while (picked.length < target && remaining.length) {
    const total = remaining.reduce((sum, row) => sum + row.weight, 0);
    let cursor = rand() * total;
    let chosen = remaining.length - 1;
    for (let i = 0; i < remaining.length; i += 1) {
      cursor -= remaining[i].weight;
      if (cursor <= 0) {
        chosen = i;
        break;
      }
    }
    picked.push(remaining[chosen].item);
    remaining.splice(chosen, 1);
  }
  return picked;
}

/**
 * Build a fresh salt so force-regenerate produces a new assortment.
 * @returns {string}
 */
export function newGenerationSalt() {
  const rand =
    globalThis.crypto?.getRandomValues?.(new Uint32Array(2)) ??
    [Math.floor(Math.random() * 0xffffffff), Math.floor(Math.random() * 0xffffffff)];
  return `${Date.now()}-${rand[0].toString(36)}-${rand[1].toString(36)}`;
}
