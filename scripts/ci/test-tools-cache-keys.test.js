const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(
  path.join(__dirname, '../../.github/workflows/test-tools.yml'),
  'utf8',
);

function matchingCacheBlocks(cachePath) {
  return workflow
    .split(/(?=^      - name: )/m)
    .filter(block => block.includes(`\n            ${cachePath}\n`));
}

function workflowJobCount() {
  const jobs = workflow.slice(workflow.indexOf('\njobs:\n') + '\njobs:\n'.length);
  return (jobs.match(/^  [a-zA-Z0-9_-]+:\s*$/gm) || []).length;
}

function restoreKeys(block) {
  const lines = block.split('\n');
  const restoreKeysIndex = lines.findIndex(line =>
    /^\s*restore-keys:\s*\|\s*$/.test(line),
  );

  if (restoreKeysIndex === -1) {
    return [];
  }

  const parentIndent = lines[restoreKeysIndex].search(/\S/);
  const keys = [];
  for (const line of lines.slice(restoreKeysIndex + 1)) {
    if (line.trim() === '') {
      continue;
    }
    if (line.search(/\S/) <= parentIndent) {
      break;
    }
    keys.push(line.trim());
  }
  return keys;
}

test('package npm caches use dependency keys without fallback restores', () => {
  const cacheBlocks = matchingCacheBlocks('packages/**/.npm');

  assert.equal(
    cacheBlocks.length,
    workflowJobCount(),
    'expected one package npm cache per job',
  );
  for (const block of cacheBlocks) {
    assert.match(
      block,
      /^\s*key: \$\{\{ runner\.os \}\}-node-24-pkg-npm-\$\{\{ hashFiles\('packages\/\*\*\/package\.js', 'packages\/\*\*\/npm-shrinkwrap\.json'\) \}\}$/m,
    );
    assert.doesNotMatch(block, /^\s*restore-keys:/m);
  }
});

test('dev bundle caches use dependency keys with fallback restores', () => {
  const cacheBlocks = matchingCacheBlocks('.meteor');

  assert.equal(
    cacheBlocks.length,
    workflowJobCount(),
    'expected one dev bundle cache per job',
  );
  for (const block of cacheBlocks) {
    assert.match(
      block,
      /^[ \t]*key: \$\{\{ runner\.os \}\}-node-24-meteor-tools-\$\{\{ hashFiles\('meteor', 'package-lock\.json'\) \}\}$/m,
    );
    assert.doesNotMatch(block, /tools\/package(?:-lock)?\.json/);
    assert.deepEqual(
      restoreKeys(block),
      [
        '${{ runner.os }}-node-24-meteor-tools-',
        '${{ runner.os }}-node-24-meteor-',
      ],
    );
  }
});
