const { AsyncLocalStorage } = require('node:async_hooks');

const ARCHIVE_MODES = new Set(['production', 'development']);
const BUILD_COMMANDS = new Set(['build', 'deploy']);

/**
 * Isolate transient tree entries for an explicitly scoped production target.
 * The original key function must return a JSON string or undefined. Namespaced
 * keys cannot collide with that JSON. Unscoped callers keep the original keys.
 *
 * Cleanup releases cache references, not trees held by callers. Tracking keys
 * costs O(keys visited in a target), including keys already evicted by the LRU.
 * Closed async descendants bypass the cache so they cannot resurrect entries.
 *
 * @param {Function} wrap The bundled optimism.wrap implementation.
 * @param {Function} compute The existing prelink computation.
 * @param {{max: number, makeCacheKey: Function}} options Original cache options.
 * @param {(event: object) => void} emit Optional lifecycle diagnostics.
 * @returns {{cached: Function, runForTarget: Function}}
 */
function createTargetPrelinkCache(wrap, compute, options, emit = () => {}) {
  const storage = new AsyncLocalStorage();
  let nextScopeId = 0;
  const cached = wrap(compute, {
    ...options,
    makeCacheKey(...args) {
      const scope = storage.getStore();
      if (scope && scope.closed) return undefined;

      const key = options.makeCacheKey(...args);
      if (key === undefined || !scope) return key;

      const scopedKey = `target:${scope.id}:${key}`;
      scope.keys.add(scopedKey);
      return scopedKey;
    },
  });

  function runForTarget({ enabled, buildMode, commandName, arch }, callback) {
    // `build --debug` uses development mode while still producing an archive.
    // Command identity keeps dev-server rebuilds out, including run --production.
    if (!enabled || !ARCHIVE_MODES.has(buildMode) || !BUILD_COMMANDS.has(commandName)) {
      // A development target nested inside production work must use the shared
      // cache too, rather than inherit its caller's temporary namespace.
      return storage.exit(callback);
    }

    const scope = { id: ++nextScopeId, keys: new Set(), closed: false };
    return storage.run(scope, async () => {
      try {
        emit({ event: 'scope-start', scopeId: scope.id, arch, cacheEntries: cached.size });
        // Await completion before finally disposes the cache entries.
        return await callback();
      } finally {
        scope.closed = true;
        const cacheEntriesBefore = cached.size;
        const trackedKeys = scope.keys.size;
        for (const key of scope.keys) cached.forgetKey(key);
        scope.keys.clear();
        emit({ event: 'scope-end', scopeId: scope.id, arch, trackedKeys,
          cacheEntriesBefore, cacheEntriesAfter: cached.size });
      }
    });
  }

  return { cached, runForTarget };
}

exports.createTargetPrelinkCache = createTargetPrelinkCache;
