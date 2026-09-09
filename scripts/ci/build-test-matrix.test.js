const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { buildMatrix } = require('./build-test-matrix.js');

const workflow = fs.readFileSync(
  path.join(__dirname, '../../.github/workflows/test-tools.yml'),
  'utf8',
);

function workflowStep(name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  assert.notEqual(start, -1, `missing workflow step: ${name}`);
  const next = workflow.indexOf('\n      - name:', start + 1);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

test('setup runs the matrix validation with the Node test runner', () => {
  const setup = workflowStep('Validate test matrix generator');
  assert.match(setup, /node --test scripts\/ci\/build-test-matrix\.test\.js/);
});

test('groups tests by file and builds literal anchored selectors', () => {
  const matrix = buildMatrix([
    { file: 'ordinary', name: 'first test', tags: [] },
    { file: 'special.(file)+[x]?', name: 'special test', tags: [] },
    { file: 'ordinary', name: 'second test', tags: ['net'] },
    { file: 'cordova-builds', name: 'cordova test', tags: ['cordova'] },
  ]);

  assert.equal(matrix.include.length, 3);
  assert.deepEqual(matrix.include.map(({ file, count }) => ({ file, count })), [
    { file: 'ordinary', count: 2 },
    { file: 'special.(file)+[x]?', count: 1 },
    { file: 'cordova-builds', count: 1 },
  ]);

  assert.equal(matrix.include[1].fileRegex,
    String.raw`^special\.\(file\)\+\[x\]\?$`);
  assert.equal(new RegExp(matrix.include[1].fileRegex).test('special.(file)+[x]?'), true);
  assert.equal(new RegExp(matrix.include[1].fileRegex).test('specialX(file)+[x]?'), false);
});

test('classifies only allowlisted resource-heavy files', () => {
  const matrix = buildMatrix([
    { file: 'cordova-builds', name: 'cordova test', tags: [] },
    { file: 'modern', name: 'modern test', tags: [] },
    { file: 'ordinary', name: 'ordinary test', tags: [] },
  ]);

  assert.deepEqual(matrix.include.map(({ file, resources }) => ({ file, resources })), [
    { file: 'cordova-builds', resources: 'heavy' },
    { file: 'modern', resources: 'heavy' },
    { file: 'ordinary', resources: 'default' },
  ]);
});

test('rejects malformed test records before they reach workflow expressions', () => {
  assert.throws(
    () => buildMatrix([{ file: '../escape', name: 'bad', tags: [] }]),
    /invalid file/,
  );
  assert.throws(
    () => buildMatrix([{ file: 'line\nbreak', name: 'bad', tags: [] }]),
    /invalid file/,
  );
});

test('discovery includes online tests while execution keeps the default offline policy', () => {
  const discovery = workflowStep('Discover tests and build matrix');
  const execution = workflowStep('Running self-test');

  assert.match(discovery, /--force-online/);
  assert.doesNotMatch(execution, /--force-online/);

  for (const step of [discovery, execution]) {
    assert.match(step, /--exclude "\$SELF_TEST_EXCLUDE"/);
    assert.match(step, /--without-tag "custom-warehouse"/);
    assert.match(step, /--headless/);
  }
});
