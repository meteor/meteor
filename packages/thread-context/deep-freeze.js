/**
 * @module thread-context/deep-freeze
 * @description Recursive `Object.freeze` for plain data (settings snapshots).
 */

/**
 * Freezes `value` and every nested object or array reachable from it.
 * Non-object values are returned unchanged. Already-frozen subtrees are
 * not revisited, which also guards against cycles.
 *
 * @template T
 * @param {T} value
 * @returns {T} The same value, frozen.
 */
export function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;

  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object' && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }
  return value;
}
