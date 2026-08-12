const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  analyzeTestEntries,
} = require('../test-classifier.js');

function write(root, filename, source) {
  const absolute = path.join(root, filename);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, source);
  return absolute;
}

test('Rspack classifies direct and transitive test dependencies per entry', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-classifier-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'node_modules/@rstest/core/package.json', JSON.stringify({
    name: '@rstest/core',
    version: '0.0.0-test',
    main: 'index.js',
  }));
  write(root, 'node_modules/@rstest/core/index.js', `
    export const test = () => {};
    export const optional = () => import('missing-optional-tooling');
  `);
  write(root, 'support/test-api.js', "export { test } from '@rstest/core';");
  write(root, 'domain/items.js', "import 'meteor/mongo'; export const value = 42;");
  const native = write(root, 'native.test.js', "import { test } from '@rstest/core'; test('native', () => {});");
  const wrapped = write(root, 'wrapped.test.js', "import { test } from './support/test-api.js'; test('wrapped', () => {});");
  const runtime = write(root, 'runtime.test.js', "import { value } from './domain/items.js'; export { value };");
  const dynamic = write(root, 'dynamic.test.js', "export const load = () => import('meteor/tracker');");
  const commonjs = write(root, 'commonjs.test.cjs', "module.exports = require('meteor/random');");
  const typeOnly = write(root, 'types.test.ts', "import type { Mongo } from 'meteor/mongo'; export const value: number = 1;");
  const unresolvedLegacy = write(
    root,
    'legacy.test.js',
    "import 'missing-legacy-test-helper'; describe('legacy', () => {});",
  );

  const result = await analyzeTestEntries({
    root,
    entries: [
      native, wrapped, runtime, dynamic, commonjs, typeOnly, unresolvedLegacy,
    ],
  });
  const byFile = new Map(result.map(item => [item.file, item.requests]));
  const requests = file => byFile.get(file).map(item => item.request);

  assert.ok(requests(native).includes('@rstest/core'));
  assert.ok(requests(wrapped).includes('@rstest/core'));
  assert.ok(requests(runtime).includes('meteor/mongo'));
  assert.ok(requests(dynamic).includes('meteor/tracker'));
  assert.ok(requests(commonjs).includes('meteor/random'));
  assert.equal(requests(typeOnly).includes('meteor/mongo'), false);
  assert.ok(requests(unresolvedLegacy).includes('missing-legacy-test-helper'));
  assert.ok(
    byFile.get(runtime).find(item => item.request === 'meteor/mongo').issuer.endsWith('domain/items.js'),
  );
});
