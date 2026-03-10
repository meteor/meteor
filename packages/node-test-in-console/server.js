// Minimal driver for node:test.
//
// Package test files should `import { describe, it } from 'node:test'`
// and `import assert from 'node:assert/strict'`.
//
// node:test queues tests at import time and runs them after the
// microtask queue drains.  Because Meteor keeps the event loop alive
// (HTTP server, Mongo), node:test never fires `beforeExit` so it never
// writes its final summary or sets process.exitCode.
//
// Strategy: detect node:test output (TAP or spec), track failures,
// debounce — when stdout goes quiet for 2s after test output, exit
// with the right code.

const nodeTestMarkers = [
  'TAP version',      // TAP reporter
  /^[▶✔✕✗⚠●○─]/m,  // spec reporter symbols
  /^ok \d/m,           // TAP ok line
  /^not ok \d/m,       // TAP failure line
];

const failureMarkers = [
  /^not ok /m,   // TAP failure
  /^[✖✕✗]/m,    // spec reporter failure symbols
  /^\s+[✖✕✗]/m, // indented spec failures
];

const originalWrite = process.stdout.write.bind(process.stdout);
let sawNodeTest = false;
let debounceTimer = null;
let failures = 0;

function isNodeTestOutput(str) {
  return nodeTestMarkers.some(m =>
    typeof m === 'string' ? str.includes(m) : m.test(str)
  );
}

function countFailures(str) {
  return failureMarkers.reduce((count, m) => {
    const matches = str.match(new RegExp(m.source, 'gm'));
    return count + (matches ? matches.length : 0);
  }, 0);
}

process.stdout.write = function (chunk, encoding, cb) {
  const result = originalWrite(chunk, encoding, cb);
  const str = typeof chunk === 'string' ? chunk : chunk.toString();

  if (!sawNodeTest && isNodeTestOutput(str)) {
    sawNodeTest = true;
  }

  if (sawNodeTest) {
    failures += countFailures(str);

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`\n[node-test-in-console] tests complete. ${failures ? 'FAILURES: ' + failures : 'ALL PASSED'}`);
      process.exit(failures > 0 ? 1 : 0);
    }, 2000);
  }

  return result;
};

Meteor.startup(() => {
  console.log('[node-test-in-console] waiting for node:test to complete...');
});
