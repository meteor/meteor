const assert = require('node:assert/strict');
const test = require('node:test');

const {
  formatResultFrame,
  formatRuntimeReport,
} = require('../runtime/reporter.js');
const { validateResult } = require('../runtime/coordinator.js');

const ANSI_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m`,
  'g',
);

function caseResult({
  name,
  status = 'pass',
  duration,
  errors,
  error,
  testPath,
  worker,
}) {
  return {
    name,
    fullName: name,
    status,
    ...(duration === undefined ? {} : { duration }),
    ...(errors ? { errors } : {}),
    ...(error ? { error } : {}),
    ...(testPath ? { testPath } : {}),
    ...(worker ? { worker } : {}),
  };
}

function result(cases) {
  const stats = {
    total: cases.length,
    passed: cases.filter(item => item.status === 'pass').length,
    failed: cases.filter(item => item.status === 'fail').length,
    skipped: cases.filter(item => item.status === 'skip').length,
    todo: cases.filter(item => item.status === 'todo').length,
  };
  return { ok: stats.failed === 0, stats, cases };
}

test('runtime reporter preserves stable machine result frame', () => {
  const runtimeResult = result([
    caseResult({ name: 'Mongo > inserts', status: 'fail' }),
  ]);

  const frame = formatResultFrame({
    architecture: 'server',
    generation: 3,
    result: runtimeResult,
  });

  assert.match(frame, /^\[Meteor-Rstest\] /);
  assert.deepEqual(JSON.parse(frame.slice('[Meteor-Rstest] '.length)), {
    type: 'result',
    protocolVersion: 1,
    generation: 3,
    architecture: 'server',
    result: runtimeResult,
  });
});

test('default runtime report matches Rstest file and total layout', () => {
  const serverFile = 'tests/rstest/runtime/server/memory.test.js';
  const clientFile = 'tests/rstest/runtime/client/memory.test.js';
  const output = formatRuntimeReport({
    colors: false,
    entries: [{
      architecture: 'server',
      result: result([
        caseResult({ name: 'memory > inserts', duration: 4, testPath: serverFile }),
        caseResult({ name: 'memory > updates', duration: 7, testPath: serverFile }),
      ]),
    }, {
      architecture: 'web.browser',
      result: result([
        caseResult({ name: 'memory > renders', duration: 3, testPath: clientFile }),
      ]),
    }],
  });

  assert.equal(output, [
    ` ✓ ${serverFile} (2)`,
    ` ✓ ${clientFile} (1)`,
    '',
    ' Test Files  2 passed',
    '      Tests  3 passed',
  ].join('\n'));
  assert.doesNotMatch(output, /memory > inserts/);
});

test('default runtime report keeps failures actionable and avoids duplicate stack heading', () => {
  const testPath = 'tests/rstest/runtime/server/memory.test.js';
  const output = formatRuntimeReport({
    colors: false,
    entries: [{
      architecture: 'server',
      result: result([
        caseResult({ name: 'memory > works', duration: 2, testPath }),
        caseResult({
          name: 'memory > rejects invalid player',
          status: 'fail',
          duration: 5,
          testPath,
          errors: [{
            name: 'AssertionError',
            message: 'Expected "invalid" to be "valid"',
            stack: 'AssertionError: Expected "invalid" to be "valid"\n    at memory.test.js:4:2',
          }],
        }),
      ]),
    }],
  });

  assert.equal(output, [
    ` × ${testPath} (2)`,
    '',
    ' FAIL  memory > rejects invalid player',
    ' AssertionError: Expected "invalid" to be "valid"',
    '     at memory.test.js:4:2',
    '',
    ' Test Files  1 failed',
    '      Tests  1 failed | 1 passed (2)',
  ].join('\n'));
  assert.equal(
    output.match(/AssertionError: Expected "invalid" to be "valid"/g).length,
    1,
  );
});

test('verbose runtime report includes every case status and duration', () => {
  const testPath = 'tests/rstest/runtime/server/memory.test.js';
  const output = formatRuntimeReport({
    colors: false,
    verbose: true,
    entries: [{
      architecture: 'server',
      result: result([
        caseResult({ name: 'memory > works', duration: 2, testPath }),
        caseResult({ name: 'memory > skipped', status: 'skip', testPath }),
        caseResult({ name: 'memory > later', status: 'todo', testPath }),
      ]),
    }],
  });

  assert.equal(output, [
    ` ✓ ${testPath} (3)`,
    '   ✓ memory > works (2ms)',
    '   - memory > skipped',
    '   * memory > later',
    '',
    ' Test Files  1 passed',
    '      Tests  1 passed | 1 skipped | 1 todo (3)',
  ].join('\n'));
});

test('verbose runtime report attributes cases to workers without exposing them by default', () => {
  const testPath = 'tests/rstest/runtime/server/mongo.test.js';
  const entries = [{
    architecture: 'workers',
    result: result([
      caseResult({
        name: 'Mongo > inserts',
        duration: 6,
        testPath,
        worker: 'server-2',
      }),
    ]),
  }];

  const compact = formatRuntimeReport({ entries, colors: false });
  const verbose = formatRuntimeReport({ entries, colors: false, verbose: true });

  assert.doesNotMatch(compact, /server-2/);
  assert.match(verbose, /✓ Mongo > inserts \(6ms\) \[server-2\]/);
});

test('default runtime report distinguishes skipped and todo-only files', () => {
  const output = formatRuntimeReport({
    colors: false,
    entries: [{
      architecture: 'server',
      result: result([
        caseResult({
          name: 'filtered case',
          status: 'skip',
          testPath: 'tests/rstest/runtime/server/filtered.test.js',
        }),
        caseResult({
          name: 'future case',
          status: 'todo',
          testPath: 'tests/rstest/runtime/server/future.test.js',
        }),
      ]),
    }],
  });

  assert.equal(output, [
    ' - tests/rstest/runtime/server/filtered.test.js (1)',
    ' * tests/rstest/runtime/server/future.test.js (1)',
    '',
    ' Test Files  1 skipped | 1 todo (2)',
    '      Tests  1 skipped | 1 todo (2)',
  ].join('\n'));
});

test('worker label and singular error shape use same formatter', () => {
  const output = formatRuntimeReport({
    colors: false,
    entries: [{
      architecture: 'workers',
      label: 'Meteor runtime · 2 workers',
      result: result([
        caseResult({
          name: 'worker two > failed',
          status: 'fail',
          error: { name: 'Error', message: 'worker failed' },
        }),
      ]),
    }],
  });

  assert.match(output, /^ × Meteor runtime · 2 workers \(1\)/);
  assert.match(output, /Error: worker failed/);
  assert.match(output, /Test Files  1 failed/);
});

test('runtime formatter emits optional ANSI colors without changing text', () => {
  const entries = [{
    architecture: 'server',
    result: result([caseResult({ name: 'works' })]),
  }];
  const plain = formatRuntimeReport({ entries, colors: false });
  const colored = formatRuntimeReport({ entries, colors: true });

  assert.ok(colored.includes(`${String.fromCharCode(27)}[32m✓`));
  assert.ok(colored.includes(`${String.fromCharCode(27)}[1mTest Files`));
  assert.equal(colored.replace(ANSI_PATTERN, ''), plain);
  assert.equal(formatRuntimeReport({ entries: [], colors: false }), '');
});

test('runtime transport accepts only internally consistent result schemas', () => {
  const runtimeResult = result([caseResult({ name: 'works' })]);
  assert.equal(validateResult(runtimeResult), true);
  assert.equal(validateResult({ ...runtimeResult, ok: false }), false);
  assert.equal(validateResult({
    ...runtimeResult,
    stats: { ...runtimeResult.stats, total: 2 },
  }), false);
  assert.equal(validateResult({ ...runtimeResult, cases: [] }), false);
});
