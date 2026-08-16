const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeUpstreamFileResults,
} = require('../server/upstream-result.js');
const { validateResult } = require('../runtime/coordinator.js');

test('upstream result normalizer preserves case semantics in protocol v1 shape', () => {
  const result = normalizeUpstreamFileResults([{
    testPath: 'tests/rstest/runtime/server/upstream.test.js',
    status: 'fail',
    results: [{
      testId: 'case-1',
      project: 'meteor-runtime-server',
      testPath: 'tests/rstest/runtime/server/upstream.test.js',
      parentNames: ['database', 'users'],
      name: 'inserts',
      status: 'pass',
      duration: 7,
      retryCount: 1,
      retryErrors: [{ name: 'Error', message: 'first attempt' }],
      meta: { executor: 'meteor-server' },
    }, {
      testId: 'case-2',
      project: 'meteor-runtime-server',
      testPath: 'tests/rstest/runtime/server/upstream.test.js',
      parentNames: ['database'],
      name: 'rejects invalid input',
      status: 'fail',
      duration: 3,
      errors: [{ name: 'AssertionError', message: 'invalid input accepted' }],
    }, {
      testId: 'case-3',
      project: 'meteor-runtime-server',
      testPath: 'tests/rstest/runtime/server/upstream.test.js',
      name: 'disabled',
      status: 'skip',
    }, {
      testId: 'case-4',
      project: 'meteor-runtime-server',
      testPath: 'tests/rstest/runtime/server/upstream.test.js',
      name: 'future',
      status: 'todo',
    }],
  }]);

  assert.deepEqual(result, {
    ok: false,
    stats: { total: 4, passed: 1, failed: 1, skipped: 1, todo: 1 },
    cases: [{
      name: 'inserts',
      fullName: 'database > users > inserts',
      status: 'pass',
      testPath: 'tests/rstest/runtime/server/upstream.test.js',
      duration: 7,
      retryCount: 1,
      retryErrors: [{ name: 'Error', message: 'first attempt' }],
      meta: { executor: 'meteor-server' },
    }, {
      name: 'rejects invalid input',
      fullName: 'database > rejects invalid input',
      status: 'fail',
      testPath: 'tests/rstest/runtime/server/upstream.test.js',
      duration: 3,
      errors: [{ name: 'AssertionError', message: 'invalid input accepted' }],
    }, {
      name: 'disabled',
      fullName: 'disabled',
      status: 'skip',
      testPath: 'tests/rstest/runtime/server/upstream.test.js',
    }, {
      name: 'future',
      fullName: 'future',
      status: 'todo',
      testPath: 'tests/rstest/runtime/server/upstream.test.js',
    }],
  });
  assert.equal(validateResult(result), true);
});

test('upstream result normalizer rejects malformed results before transport', () => {
  const validFile = {
    testPath: 'imports/safe.test.js',
    results: [{
      name: 'safe',
      status: 'pass',
      testPath: 'imports/safe.test.js',
    }],
  };

  assert.throws(
    () => normalizeUpstreamFileResults([{ ...validFile, results: null }]),
    /results must be an array/,
  );
  assert.throws(
    () => normalizeUpstreamFileResults([{
      ...validFile,
      results: [{ ...validFile.results[0], status: 'unknown' }],
    }]),
    /unsupported status/,
  );
  assert.throws(
    () => normalizeUpstreamFileResults([{
      ...validFile,
      results: [{ ...validFile.results[0], testPath: '../outside.test.js' }],
    }]),
    /safe app-relative POSIX path/,
  );
});

test('upstream result normalizer keeps the canonical equality assertion message', () => {
  const result = normalizeUpstreamFileResults([{
    testPath: 'imports/failure.test.js',
    results: [{
      name: 'compares objects',
      status: 'fail',
      errors: [{
        name: 'AssertionError',
        message: "expected { compiler: 'rspack' } to deeply equal { compiler: 'other' }",
        actual: 'Object {\n  "compiler": "rspack",\n}',
        expected: 'Object {\n  "compiler": "other",\n}',
      }],
    }],
  }]);

  assert.equal(
    result.cases[0].errors[0].message,
    'Expected {"compiler":"rspack"} to equal {"compiler":"other"}',
  );
});

test('upstream result normalizer preserves non-equality assertion messages', () => {
  const message = "expected 'Rspack' to contain 'Webpack'";
  const result = normalizeUpstreamFileResults([{
    testPath: 'imports/failure.test.js',
    results: [{
      name: 'contains text',
      status: 'fail',
      errors: [{
        name: 'AssertionError',
        operator: 'contains',
        message,
        actual: 'Rspack',
        expected: 'Webpack',
      }],
    }],
  }]);

  assert.equal(result.cases[0].errors[0].message, message);
});
