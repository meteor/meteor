const assert = require('node:assert/strict');
const test = require('node:test');

const { formatResultFrame, formatSummary } = require('../runtime/reporter.js');
const { validateResult } = require('../runtime/coordinator.js');

test('runtime reporter emits stable machine frame and readable summary', () => {
  const result = {
    ok: false,
    stats: { total: 2, passed: 1, failed: 1, skipped: 0, todo: 0 },
    cases: [{
      fullName: 'Mongo > inserts',
      status: 'fail',
      errors: [{ name: 'AssertionError', message: 'bad value', stack: 'stack' }],
    }],
  };

  const frame = formatResultFrame({ architecture: 'server', generation: 3, result });
  assert.match(frame, /^\[Meteor-Rstest\] /);
  assert.deepEqual(JSON.parse(frame.slice('[Meteor-Rstest] '.length)), {
    type: 'result',
    protocolVersion: 1,
    generation: 3,
    architecture: 'server',
    result,
  });
  assert.equal(
    formatSummary({ architecture: 'server', result }),
    '[Meteor Rstest] server: 1 passed, 1 failed, 0 skipped, 0 todo'
  );
});

test('runtime transport accepts only internally consistent result schemas', () => {
  const result = {
    ok: true,
    stats: { total: 1, passed: 1, failed: 0, skipped: 0, todo: 0 },
    cases: [{ name: 'works', fullName: 'works', status: 'pass' }],
  };
  assert.equal(validateResult(result), true);
  assert.equal(validateResult({ ...result, ok: false }), false);
  assert.equal(validateResult({
    ...result,
    stats: { ...result.stats, total: 2 },
  }), false);
  assert.equal(validateResult({ ...result, cases: [] }), false);
});
