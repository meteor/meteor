const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  MeteorCoverageCaptureReporter,
} = require('../src/coverage/reporter.js');

test('native capture reporter atomically persists the Istanbul map with private permissions', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-coverage-'));
  const outputPath = path.join(root, 'native.json');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const coverage = {
    '/app/imports/answer.js': {
      path: '/app/imports/answer.js',
      statementMap: {},
      fnMap: {},
      branchMap: {},
      s: {},
      f: {},
      b: {},
    },
  };

  await new MeteorCoverageCaptureReporter({
    outputPath,
    generation: 'generation-4',
  }).onTestRunEnd({ coverage });

  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), {
    schemaVersion: 1,
    generation: 'generation-4',
    producer: 'native',
    coverage,
  });
  assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
  assert.equal(fs.readdirSync(root).some(name => name.endsWith('.tmp')), false);
});
