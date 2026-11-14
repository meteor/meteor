const assert = require('node:assert/strict');
const test = require('node:test');

const { getModuleReplacement } = require('./module-replacements.js');

test('module replacement uses the provider entry and exact npm path boundaries', () => {
  const replacements = [{
    module: '@example/runner/dist/index.js',
    source: 'export const test = globalThis.exampleTest;',
  }];
  const entry = '/app/node_modules/@example/runner/dist/index.js';

  assert.equal(getModuleReplacement(entry, replacements), replacements[0].source);
  assert.equal(getModuleReplacement(entry.replace(/\//g, '\\'), replacements),
    replacements[0].source);
  assert.equal(getModuleReplacement(entry), null);
  assert.equal(getModuleReplacement(entry.replace('index.js', 'api/index.js'), replacements), null);
  assert.equal(getModuleReplacement(entry.replace('/node_modules/', '/other_node_modules/'), replacements), null);
  assert.equal(getModuleReplacement('/app/node_modules/example/dist/index.js', replacements), null);
});

test('an empty replacement module is still an intentional replacement', () => {
  assert.equal(getModuleReplacement('/app/node_modules/example/index.js', [{
    module: 'example/index.js',
    source: '',
  }]), '');
});
