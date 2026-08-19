const assert = require('node:assert/strict');
const test = require('node:test');

const { buildMatrix } = require('./build-test-matrix.js');

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
