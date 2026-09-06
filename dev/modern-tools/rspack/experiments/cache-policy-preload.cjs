const path = require('node:path');
const fs = require('node:fs');
const { POLICIES, wrapWithPolicy } = require('./cache-policies.cjs');

// Only the tool process receives this intervention, not its Node children.
if ((process.argv[1] || '').endsWith('/tools/index.js')) {
  const root = path.resolve(__dirname, '../../../..');
  const optimism = require(path.join(root, 'dev_bundle/lib/node_modules/optimism'));
  const policy = process.env.METEOR_LINKER_CACHE_EXPERIMENT;
  if (!Object.values(POLICIES).includes(policy)) {
    throw new Error(`Unknown cache policy: ${policy}`);
  }

  const emit = event => fs.writeSync(2, '[cache-policy] ' + JSON.stringify({ policy, ...event }) + '\n');
  const originalWrap = optimism.wrap;
  let matches = 0;
  optimism.wrap = function(compute, options) {
    const keySource = options && typeof options.makeCacheKey === 'function'
      ? options.makeCacheKey.toString() : '';
    const matchesLinker = options && options.max === 4096 &&
      keySource.includes('file.bundleArch') && keySource.includes('file._inputHash') &&
      new Error().stack.includes('/tools/isobuild/linker.js');
    if (!matchesLinker) return originalWrap.apply(this, arguments);
    matches++;
    if (matches !== 1) throw new Error('Multiple prelink caches matched');
    emit({ event: 'matched' });
    return wrapWithPolicy(originalWrap, compute, options, policy, emit);
  };

  process.on('exit', () => {
    if (matches !== 1) {
      emit({ event: 'invalid-match-count', matches });
      process.exitCode = 1;
    }
  });
}
