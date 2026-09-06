const POLICIES = Object.freeze({
  BASELINE: 'baseline',
  BYPASS_LARGE: 'bypass-large',
  CAP_128: 'cap-128',
  ROTATE_ARCH: 'rotate-arch',
});
const LARGE_CODE_UNITS = 1024 * 1024;
const ENTRY_CAP = 128;

/**
 * Apply an experimental policy to the actual optimism wrapper. This module is
 * loaded only by the explicit preload or its tests, never by the Meteor tool.
 * Source length and entry count are proxies, not retained-memory budgets.
 *
 * @param {Function} wrap The bundled optimism.wrap implementation.
 * @param {Function} compute The existing prelink computation.
 * @param {{max: number, makeCacheKey: Function}} options Original cache options.
 * @param {string} policy One of POLICIES.
 * @param {(event: object) => void} emit Diagnostic event sink.
 * @returns {Function} The optimism memoized function, including its cache methods.
 */
function wrapWithPolicy(wrap, compute, options, policy, emit = () => {}) {
  if (!Object.values(POLICIES).includes(policy)) {
    throw new Error(`Unknown cache policy: ${policy}`);
  }

  const keys = new Set();
  let lastArch;
  let cached;
  const configured = {
    ...options,
    max: policy === POLICIES.CAP_128 ? ENTRY_CAP : options.max,
    makeCacheKey(file, fileOptions) {
      const key = options.makeCacheKey(file, fileOptions);
      if (key === undefined) return key;

      if (policy === POLICIES.BYPASS_LARGE && file.source.length >= LARGE_CODE_UNITS) {
        emit({ event: 'bypass', arch: file.bundleArch, codeUnits: file.source.length });
        return undefined;
      }

      if (policy === POLICIES.ROTATE_ARCH) {
        // Some linker callers omit bundleArch. They do not establish a new
        // target. Use forgetKey so optimism disposes dependency relationships.
        if (typeof file.bundleArch === 'string') {
          if (lastArch !== undefined && lastArch !== file.bundleArch) {
            const entriesBefore = cached.size;
            for (const priorKey of keys) cached.forgetKey(priorKey);
            keys.clear();
            emit({ event: 'rotate', from: lastArch, to: file.bundleArch, entriesBefore, entriesAfter: cached.size });
          }
          lastArch = file.bundleArch;
        }
        keys.add(key);
      }

      return key;
    },
  };
  cached = wrap(compute, configured);
  return cached;
}

module.exports = { POLICIES, wrapWithPolicy };
