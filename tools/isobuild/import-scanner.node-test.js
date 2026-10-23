require('../tool-env/install-babel.js');

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const ImportScanner = require('./import-scanner').default;
const { rspackBuildContext } = require('../tool-env/rspack');

test('Rspack import scanning preserves the marked legacy fast path', async () => {
  const scanner = Object.create(ImportScanner.prototype);
  const source = 'require("runtime-helper");';
  const scan = async (arch, data) => {
    scanner.bundleArch = arch;
    return scanner.findImportedModuleIdentifiers({
      type: 'js',
      sourcePath: `${rspackBuildContext}/client/app-rspack.js`,
      data,
      hash: createHash('sha1').update(data).digest('hex'),
    });
  };

  // Older adapters need Meteor to discover helpers added by the final legacy
  // transform. The same import in already-compiled output belongs to Rspack.
  const legacy = await scan('web.browser.legacy', source);
  assert.deepEqual(Object.keys(legacy), ['runtime-helper']);
  assert.deepEqual(await scan('web.browser', source), {});
  assert.deepEqual(await scan(
    'web.browser.legacy',
    `${source}\n/* meteor-rspack-legacy-compatible */`,
  ), {});
});
