// meteor-test driver
//
// Modern test driver for Meteor using the Node.js native test runner.
//
// Package test files use `import { describe, it } from 'node:test'` and
// `import assert from 'node:assert/strict'` directly.
//
// node:test queues tests at import time and runs them after the microtask
// queue drains. Because Meteor keeps the event loop alive (HTTP server,
// Mongo oplog tail), node:test never fires `beforeExit` — so it never
// writes its final summary or sets process.exitCode.
//
// Strategy: intercept stdout, parse TAP output, detect the root-level
// plan line (1..N) as the deterministic completion signal, then print
// a compact summary and exit.

const originalWrite = process.stdout.write.bind(process.stdout);
const verbose = process.env.NODE_TEST_VERBOSE === '1';

// --- ANSI helpers ---
const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  gray:   s => `\x1b[90m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
};

// --- TAP parser state ---
let sawTAP = false;
let inYamlBlock = false;
let pendingError = null;

// Suite tracking
let currentSuite = null;
const suites = [];
let suitesOpened = 0;
let suitesClosed = 0;

// Global counters
let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;
let totalTodo = 0;

function newSuite(name) {
  return { name, passed: 0, failed: 0, skipped: 0, todo: 0, errors: [], duration: null };
}

function flushSuite() {
  if (!currentSuite) return;
  suites.push(currentSuite);

  const s = currentSuite;
  const total = s.passed + s.failed + s.skipped + s.todo;
  const parts = [];

  if (s.passed)  parts.push(c.green(`${s.passed} passed`));
  if (s.failed)  parts.push(c.red(`${s.failed} failed`));
  if (s.skipped) parts.push(c.yellow(`${s.skipped} skipped`));
  if (s.todo)    parts.push(c.gray(`${s.todo} todo`));

  const dur = s.duration !== null ? c.gray(` (${s.duration}ms)`) : '';
  let icon, name;
  if (s.failed > 0) {
    icon = c.red('✗');
    name = c.red(s.name);
  } else if (total === 0) {
    icon = c.yellow('⊘');
    name = c.yellow(s.name);
    if (!parts.length) parts.push(c.yellow('skipped'));
  } else if (s.passed === 0 && s.skipped > 0) {
    icon = c.yellow('⊘');
    name = c.yellow(s.name);
  } else {
    icon = c.green('✓');
    name = s.name;
  }

  originalWrite(`  ${icon} ${name}  ${parts.join(', ')}${dur}\n`);

  for (const err of s.errors) {
    originalWrite(`    ${c.red('→')} ${c.red(err)}\n`);
  }

  totalPassed  += s.passed;
  totalFailed  += s.failed;
  totalSkipped += s.skipped;
  totalTodo    += s.todo;
  currentSuite = null;
}

function printSummaryAndExit() {
  flushSuite();

  const total = totalPassed + totalFailed + totalSkipped + totalTodo;
  originalWrite('\n' + c.bold('  Summary: '));

  const parts = [];
  if (totalPassed)  parts.push(c.green(`${totalPassed} passed`));
  if (totalFailed)  parts.push(c.red(`${totalFailed} failed`));
  if (totalSkipped) parts.push(c.yellow(`${totalSkipped} skipped`));
  if (totalTodo)    parts.push(c.gray(`${totalTodo} todo`));
  originalWrite(parts.join(c.gray(', ')) + c.gray(` (${total} tests)`) + '\n\n');

  process.exit(totalFailed > 0 ? 1 : 0);
}

function parseTAPLine(line) {
  // YAML metadata block (--- / ... delimiters)
  if (/^\s+---\s*$/.test(line)) {
    inYamlBlock = true;
    return;
  }
  if (/^\s+\.\.\.\s*$/.test(line)) {
    inYamlBlock = false;
    if (pendingError && currentSuite) {
      currentSuite.errors.push(pendingError);
      pendingError = null;
    }
    return;
  }
  if (inYamlBlock) {
    const durMatch = line.match(/^\s+duration_ms:\s+([\d.]+)/);
    if (durMatch && currentSuite) {
      currentSuite.duration = Math.round(parseFloat(durMatch[1]));
    }
    const errMatch = line.match(/^\s+error:\s+'?(.*?)'?\s*$/);
    if (errMatch) {
      pendingError = errMatch[1];
    }
    return;
  }

  // TAP version header
  if (line.startsWith('TAP version')) return;

  // Root-level plan line: "1..N" (no leading whitespace)
  // This is the deterministic completion signal from node:test
  const rootPlan = line.match(/^1\.\.(\d+)\s*$/);
  if (rootPlan) {
    // Schedule exit on next tick to allow any remaining output to flush
    setImmediate(printSummaryAndExit);
    return;
  }

  // Indented plan lines (suite-level) — ignore
  if (/^\s+1\.\.\d+/.test(line)) return;

  // Top-level suite start: "# Subtest: Name" (no leading spaces)
  const topSubtest = line.match(/^# Subtest: (.+)/);
  if (topSubtest) {
    flushSuite();
    currentSuite = newSuite(topSubtest[1]);
    suitesOpened++;
    return;
  }

  // Nested subtest header — skip
  if (/^\s+# Subtest: /.test(line)) return;

  // Leaf test results (indented ok/not ok)
  const okMatch = line.match(/^(\s+)ok \d+ - (.+)/);
  if (okMatch) {
    if (!currentSuite) return;
    const desc = okMatch[2];
    if (desc.includes('# SKIP'))      currentSuite.skipped++;
    else if (desc.includes('# TODO')) currentSuite.todo++;
    else                              currentSuite.passed++;
    return;
  }

  const notOkMatch = line.match(/^(\s+)not ok \d+ - (.+)/);
  if (notOkMatch) {
    if (!currentSuite) return;
    currentSuite.failed++;
    return;
  }

  // Top-level ok/not ok (suite summary) — a suite just finished
  if (/^ok \d+ - /.test(line) || /^not ok \d+ - /.test(line)) {
    suitesClosed++;
    // When a suite closes, schedule exit check — if more suites come,
    // the debounce resets via new TAP output
    scheduleDebouncedExit();
    return;
  }
}

// --- stdout interception ---
//
// node:test writes TAP to stdout. In Meteor's long-running process, the
// root-level plan line (1..N) is never emitted because `beforeExit` never
// fires. We use two completion signals:
//   1. Root plan line "1..N" (deterministic, if it appears)
//   2. Debounce: 2s of silence after the last TAP output (reliable fallback)
let debounceTimer = null;
// Short debounce when all known suites are done, longer otherwise.
// This allows slow suites (DDP connect, etc.) time to start.
const DEBOUNCE_DONE_MS = 2000;
const DEBOUNCE_WAIT_MS = 15000;

function scheduleDebouncedExit() {
  if (debounceTimer) clearTimeout(debounceTimer);
  const allDone = suitesOpened > 0 && suitesOpened === suitesClosed;
  debounceTimer = setTimeout(printSummaryAndExit, allDone ? DEBOUNCE_DONE_MS : DEBOUNCE_WAIT_MS);
}

process.stdout.write = function (chunk, encoding, cb) {
  const str = typeof chunk === 'string' ? chunk : chunk.toString();

  if (!sawTAP && str.includes('TAP version')) {
    sawTAP = true;
    originalWrite(`\n${c.bold('meteor-test')} ${c.gray('· node:test runner')}\n\n`);
  }

  if (sawTAP) {
    if (verbose) originalWrite(chunk, encoding);

    for (const line of str.split('\n')) {
      parseTAPLine(line);
    }

    // Reset the long fallback debounce on every TAP chunk.
    // The short debounce is only triggered when a suite closes (in parseTAPLine).
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(printSummaryAndExit, DEBOUNCE_WAIT_MS);

    if (typeof cb === 'function') cb();
    return true;
  }

  // Non-TAP output: pass through
  return originalWrite(chunk, encoding, cb);
};

Meteor.startup(() => {
  // Bridge Tinytest tests to node:test (if tinytest is loaded)
  const { bridgeTinytestToNodeTest } = require('./bridge.js');
  const bridged = bridgeTinytestToNodeTest();

  if (bridged > 0) {
    originalWrite(c.gray(`[meteor-test] bridged ${bridged} Tinytest case(s) to node:test\n`));
  }

  originalWrite(c.gray('[meteor-test] waiting for node:test output...\n'));

  // If no tests were registered (no node:test imports, no bridged Tinytest),
  // TAP output will never appear. Set a timeout to detect this and exit cleanly.
  setTimeout(() => {
    if (!sawTAP) {
      originalWrite(c.yellow('\n  [meteor-test] No tests found.\n\n'));
      process.exit(0);
    }
  }, 5000);
});
