const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const LOADER_PATH = path.join(REPO_ROOT, 'tools/static-assets/server/esm-loader.mjs');

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-isolation-fixture-'));
  const server = path.join(root, 'programs/server');

  function write(rel, body) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }

  write('package.json', JSON.stringify({ type: 'module' }));
  write('star.json', JSON.stringify({ gitCommitHash: 'test-isolation-hash' }));
  write('programs/server/config.json', JSON.stringify({ appId: 'test-app', clientArchs: [] }));

  // Manifest with 3 packages: core-runtime, package-a, package-b, and namespaced package org:pkg-c
  write('programs/server/program.json', JSON.stringify({
    load: [
      { path: 'packages/core-runtime.js' },
      {
        path: 'packages/pkg-a.js',
        node_modules: 'npm/pkg-a/node_modules',
        assets: {
          'shared.txt': 'assets/pkg-a-shared.txt',
          'only-a.txt': 'assets/only-a.txt',
        },
      },
      {
        path: 'packages/pkg-b.js',
        node_modules: 'npm/pkg-b/node_modules',
        assets: {
          'shared.txt': 'assets/pkg-b-shared.txt',
        },
      },
      {
        path: 'packages/org_pkg-c.js',
        node_modules: 'npm/org_pkg-c/node_modules',
        assets: {
          'c-asset.txt': 'assets/c-asset.txt',
        },
      },
      { path: 'app/app.js', assets: { 'app.txt': 'assets/app.txt' } },
    ],
  }));

  write('programs/server/packages/core-runtime.js', [
    'globalThis.Package = { "core-runtime": { queue(){}, waitUntilAllLoaded(){ return null; } } };',
  ].join('\n'));

  // Package A initiates an async chain that will invoke B
  write('programs/server/packages/pkg-a.js', [
    'globalThis.aDeferredPromise = new Promise(r => { globalThis.resolveA = r; });',
    'globalThis.invokeBFromAAsync = async () => {',
    '  await globalThis.aDeferredPromise;',
    '  return await globalThis.callFromB();',
    '};',
    'globalThis.invokeBFromAWrappedContext = (fn) => {',
    '  const wrapped = globalThis.__meteorWrapPackageModule("pkg-a", { runInA: (cb) => cb() });',
    '  return wrapped.runInA(fn);',
    '};',
  ].join('\n'));

  // Package B exposes methods to test its own assets and Npm dependencies
  write('programs/server/packages/pkg-b.js', [
    'globalThis.callFromB = async () => ({',
    '  asset: await Assets.getTextAsync("shared.txt"),',
    '  npm: Npm.require("test-dep")',
    '});',
    'globalThis.callBOnlyAAsset = () => Assets.getTextAsync("only-a.txt");',
    'globalThis.callBOnlyANpm = () => Npm.require("only-a-dep");',
  ].join('\n'));

  // Namespaced Package C (org:pkg-c)
  write('programs/server/packages/org_pkg-c.js', [
    'globalThis.callFromC = async () => ({',
    '  asset: await Assets.getTextAsync("c-asset.txt"),',
    '  npm: Npm.require("c-dep")',
    '});',
  ].join('\n'));

  write('programs/server/app/app.js', 'export {};');

  // Create Assets
  write('programs/server/assets/pkg-a-shared.txt', 'asset-from-a');
  write('programs/server/assets/pkg-b-shared.txt', 'asset-from-b');
  write('programs/server/assets/only-a.txt', 'only-a-content');
  write('programs/server/assets/c-asset.txt', 'c-content');
  write('programs/server/assets/app.txt', 'app-content');

  // Create Npm packages
  write('programs/server/npm/pkg-a/node_modules/test-dep/package.json', JSON.stringify({ name: 'test-dep', version: '1.0.0', main: 'index.js' }));
  write('programs/server/npm/pkg-a/node_modules/test-dep/index.js', 'module.exports = "npm-from-a";');

  write('programs/server/npm/pkg-a/node_modules/only-a-dep/package.json', JSON.stringify({ name: 'only-a-dep', version: '1.0.0', main: 'index.js' }));
  write('programs/server/npm/pkg-a/node_modules/only-a-dep/index.js', 'module.exports = "only-a-npm-content";');

  write('programs/server/npm/pkg-b/node_modules/test-dep/package.json', JSON.stringify({ name: 'test-dep', version: '2.0.0', main: 'index.js' }));
  write('programs/server/npm/pkg-b/node_modules/test-dep/index.js', 'module.exports = "npm-from-b";');

  write('programs/server/npm/org_pkg-c/node_modules/c-dep/package.json', JSON.stringify({ name: 'c-dep', version: '1.0.0', main: 'index.js' }));
  write('programs/server/npm/org_pkg-c/node_modules/c-dep/index.js', 'module.exports = "npm-from-c";');

  // Test runner harness inside fixture
  write('test-runner.mjs', `
import { bootPackages } from ${JSON.stringify(pathToFileURL(LOADER_PATH).href)};

await bootPackages(${JSON.stringify(server)});

// 1. Direct call from B
const directB = await globalThis.callFromB();

// 2. Call from B after async event originated in A
globalThis.resolveA();
const fromA = await globalThis.invokeBFromAAsync();

// 2b. Call B from inside active async context originated in A (e.g. webapp HTTP handler calling oauth)
const fromAWrapped = await globalThis.invokeBFromAWrappedContext(() => globalThis.callFromB());

// 3. Foreign asset request from B must throw
let missingAssetRejected = false;
try {
  await globalThis.callBOnlyAAsset();
} catch (e) {
  missingAssetRejected = true;
}

// 4. Foreign npm request from B must throw
let missingNpmRejected = false;
try {
  globalThis.callBOnlyANpm();
} catch (e) {
  missingNpmRejected = true;
}

// 5. Atmosphere namespaced package C must resolve its own asset and npm module
const fromC = await globalThis.callFromC();

const results = {
  directB,
  fromA,
  fromAWrapped,
  missingAssetRejected,
  missingNpmRejected,
  fromC,
};

console.log(JSON.stringify(results));
`);

  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  return { root, runnerScript: path.join(root, 'test-runner.mjs') };
}

test('esm-loader enforces strict package isolation for assets and npm under Node', (t) => {
  const { runnerScript } = createFixture(t);
  const result = spawnSync(process.execPath, [runnerScript], {
    encoding: 'utf8',
    timeout: 10000,
  });

  assert.equal(result.status, 0, `Node run failed: ${result.stderr || result.stdout}`);
  const data = JSON.parse(result.stdout.trim());

  assert.equal(data.directB.asset, 'asset-from-b');
  assert.equal(data.directB.npm, 'npm-from-b');
  assert.equal(data.fromA.asset, 'asset-from-b');
  assert.equal(data.fromA.npm, 'npm-from-b');
  assert.equal(data.fromAWrapped.asset, 'asset-from-b');
  assert.equal(data.fromAWrapped.npm, 'npm-from-b');
  assert.equal(data.missingAssetRejected, true);
  assert.equal(data.missingNpmRejected, true);
  assert.equal(data.fromC.asset, 'c-content');
  assert.equal(data.fromC.npm, 'npm-from-c');
});

test('esm-loader enforces strict package isolation for assets and npm under Bun', (t) => {
  let bunPath = null;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(dir, 'bun');
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        bunPath = candidate;
        break;
      }
    } catch {}
  }

  if (!bunPath) {
    t.skip('Bun binary not found in PATH');
    return;
  }

  const { runnerScript } = createFixture(t);
  const result = spawnSync(bunPath, [runnerScript], {
    encoding: 'utf8',
    timeout: 10000,
  });

  assert.equal(result.status, 0, `Bun run failed: ${result.stderr || result.stdout}`);
  const data = JSON.parse(result.stdout.trim());

  assert.equal(data.directB.asset, 'asset-from-b');
  assert.equal(data.directB.npm, 'npm-from-b');
  assert.equal(data.fromA.asset, 'asset-from-b');
  assert.equal(data.fromA.npm, 'npm-from-b');
  assert.equal(data.fromAWrapped.asset, 'asset-from-b');
  assert.equal(data.fromAWrapped.npm, 'npm-from-b');
  assert.equal(data.missingAssetRejected, true);
  assert.equal(data.missingNpmRejected, true);
  assert.equal(data.fromC.asset, 'c-content');
  assert.equal(data.fromC.npm, 'npm-from-c');
});
