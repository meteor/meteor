const assert = require('node:assert/strict');
const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

test('TypeScript package, Babel wrapper, and dev bundle use the same compiler', () => {
  const bundle = JSON.parse(execFileSync(process.execPath,
    [path.join(root, 'scripts/dev-bundle-tool-package.js')], { encoding: 'utf8' }));
  let version;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'packages/typescript/package.js'), 'utf8'), {
    Package: { describe(info) { version = info.version; }, registerBuildPlugin() {}, onUse() {}, onTest() {} },
  });
  assert.equal(version, bundle.dependencies.typescript);
  const babel = require('../../npm-packages/meteor-babel/package.json');
  const lock = require('../../npm-packages/meteor-babel/package-lock.json');
  assert.equal(babel.dependencies.typescript, version);
  assert.equal(lock.dependencies.typescript.version, version);
  assert.equal(bundle.overrides['@meteorjs/babel'].typescript, '$typescript');
});
