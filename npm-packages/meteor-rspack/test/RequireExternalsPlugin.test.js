const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  RequireExternalsPlugin,
} = require('../plugins/RequireExtenalsPlugin.js');

test('keeps bare package requests with file extensions portable', () => {
  const plugin = new RequireExternalsPlugin({
    filePath: path.join('_build', 'main-dev', 'server-meteor.js'),
  });

  assert.equal(
    plugin._extractPackageName(
      'external "@scope/native/build/Release/addon.node"'
    ),
    '@scope/native/build/Release/addon.node'
  );
  assert.equal(
    plugin._extractPackageName(
      'external commonjs "@scope/native/build/Release/addon.node"'
    ),
    '@scope/native/build/Release/addon.node'
  );
  assert.equal(
    plugin._extractPackageName('external "package/subpath.js"'),
    'package/subpath.js'
  );
});

test('continues mapping relative external requests into the generated file', () => {
  const plugin = new RequireExternalsPlugin({
    filePath: path.join('_build', 'main-dev', 'server-meteor.js'),
  });

  assert.equal(
    plugin._extractPackageName('external "./client/main.html"'),
    '../../client/main.html'
  );
  assert.equal(
    plugin._extractPackageName('./client/main.html', {
      isExternal: true,
      type: 'externals',
      value: './client/main.html',
    }),
    '../../client/main.html'
  );
});
