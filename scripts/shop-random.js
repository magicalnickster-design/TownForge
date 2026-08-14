/**
 * Deterministic and reshuffleable picks for TownForge shop generation.
 */

/**
 * Stable hash string for seed text.
 * @param {string|number|null|undefined} text
 * @returns {string}
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
 * Build a fresh salt so force-regenerate produces a new assortment.
 * @returns {string}
 */
export function newGenerationSalt() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
