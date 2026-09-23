/**
 * Returns a memoized version of `fn`. The cache is intentionally unbounded —
 * this is safe for use cases with a naturally bounded key space (e.g. field
 * path strings in a Meteor app). Do not use for functions with unbounded input.
 *
 * @param {Function} fn - The function to memoize.
 * @param {Function} [keyFn] - Derives the cache key from the arguments.
 *   Defaults to using the first argument as the key.
 * @returns {Function}
 */
export function memoize(fn, keyFn) {
  const cache = new Map();
  return (...args) => {
    const key = keyFn ? keyFn(...args) : args[0];
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}
