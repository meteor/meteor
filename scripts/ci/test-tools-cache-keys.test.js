const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(
  path.join(__dirname, '../../.github/workflows/test-tools.yml'),
  'utf8',
);

function matchingCacheKeys(prefix) {
  return [...workflow.matchAll(/^\s*key: (.+)$/gm)]
    .map(([, key]) => key)
    .filter(key => key.includes(prefix));
}

test('package npm cache keys include package dependency declarations', () => {
  const keys = matchingCacheKeys('node-24-pkg-npm-');

  assert.ok(keys.length > 0, 'expected package npm cache keys');
  for (const key of keys) {
    assert.match(
      key,
      /hashFiles\('packages\/\*\*\/package\.js', 'packages\/\*\*\/npm-shrinkwrap\.json'\)/,
    );
  }
});

test('dev bundle cache keys do not reference missing tools manifests', () => {
  const keys = matchingCacheKeys('node-24-meteor-tools-');

  assert.ok(keys.length > 0, 'expected dev bundle cache keys');
  for (const key of keys) {
    assert.doesNotMatch(key, /tools\/package(?:-lock)?\.json/);
  }
});
