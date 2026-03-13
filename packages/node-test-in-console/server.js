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
// Strategy: intercept TAP output, parse it into compact colored lines,
// debounce — when stdout goes quiet for 2s after test output, print
// summary and exit with the right code.
//
// Set NODE_TEST_VERBOSE=1 for raw TAP output.

const originalWrite = process.stdout.write.bind(process.stdout);
const verbose = process.env.NODE_TEST_VERBOSE === '1';

// --- ANSI colors ---
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
let debounceTimer = null;
let inYamlBlock = false;
let pendingError = null;

// Top-level suite tracking
let currentSuite = null;
const suites = [];

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
    // Suite with no counted tests (e.g. describe.skip with no individual results)
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

  // Print errors inline
  for (const err of s.errors) {
    originalWrite(`    ${c.red('→')} ${c.red(err)}\n`);
  }

  totalPassed  += s.passed;
  totalFailed  += s.failed;
  totalSkipped += s.skipped;
  totalTodo    += s.todo;
  currentSuite = null;
}

function parseTAPLine(line) {
  // YAML metadata block (--- / ... delimiters)
  if (/^\s+---\s*$/.test(line)) {
    inYamlBlock = true;
    return;
  }
  if (/^\s+\.\.\.\s*$/.test(line)) {
    inYamlBlock = false;
    // Capture error from yaml block
    if (pendingError && currentSuite) {
      currentSuite.errors.push(pendingError);
      pendingError = null;
    }
    return;
  }
  if (inYamlBlock) {
    // Capture duration for top-level suites
    const durMatch = line.match(/^\s+duration_ms:\s+([\d.]+)/);
    if (durMatch && currentSuite) {
      currentSuite.duration = Math.round(parseFloat(durMatch[1]));
    }
    // Capture error message
    const errMatch = line.match(/^\s+error:\s+'?(.*?)'?\s*$/);
    if (errMatch) {
      pendingError = errMatch[1];
    }
    return;
  }

  // TAP version header
  if (line.startsWith('TAP version')) return;

  // Plan line (1..N)
  if (/^\s*1\.\.\d+/.test(line)) return;

  // Top-level suite start: "# Subtest: Name" (no leading spaces)
  const topSubtest = line.match(/^# Subtest: (.+)/);
  if (topSubtest) {
    flushSuite();
    currentSuite = newSuite(topSubtest[1]);
    return;
  }

  // Nested subtest (indented = individual test within a suite)
  const nestedSubtest = line.match(/^\s+# Subtest: /);
  if (nestedSubtest) return; // just a header, result comes on ok/not ok

  // Test result lines — count only leaf tests (indented)
  const okMatch = line.match(/^(\s+)ok \d+ - (.+)/);
  if (okMatch) {
    if (!currentSuite) return;
    const name = okMatch[2];
    if (name.includes('# SKIP'))      currentSuite.skipped++;
    else if (name.includes('# TODO')) currentSuite.todo++;
    else                              currentSuite.passed++;
    return;
  }

  const notOkMatch = line.match(/^(\s+)not ok \d+ - (.+)/);
  if (notOkMatch) {
    if (!currentSuite) return;
    currentSuite.failed++;
    return;
  }

  // Top-level ok/not ok (suite summary) — triggers duration capture
  if (/^ok \d+ - /.test(line) || /^not ok \d+ - /.test(line)) {
    // duration is in the yaml block that follows
    return;
  }
}

process.stdout.write = function (chunk, encoding, cb) {
  const str = typeof chunk === 'string' ? chunk : chunk.toString();

  if (!sawTAP && str.includes('TAP version')) {
    sawTAP = true;
    originalWrite(`\n${c.bold('node:test')} ${c.gray('results')}\n\n`);
  }

  if (sawTAP) {
    // In verbose mode, also print raw TAP
    if (verbose) originalWrite(chunk, encoding);

    // Parse line by line
    for (const line of str.split('\n')) {
      parseTAPLine(line);
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      flushSuite(); // flush last suite

      // Summary
      const total = totalPassed + totalFailed + totalSkipped + totalTodo;
      originalWrite('\n' + c.bold('  Summary: '));

      const parts = [];
      if (totalPassed)  parts.push(c.green(`${totalPassed} passed`));
      if (totalFailed)  parts.push(c.red(`${totalFailed} failed`));
      if (totalSkipped) parts.push(c.yellow(`${totalSkipped} skipped`));
      if (totalTodo)    parts.push(c.gray(`${totalTodo} todo`));
      originalWrite(parts.join(c.gray(', ')) + c.gray(` (${total} tests)`) + '\n\n');

      process.exit(totalFailed > 0 ? 1 : 0);
    }, 2000);

    // Don't forward TAP to stdout (we print our own format)
    if (typeof cb === 'function') cb();
    return true;
  }

  // Non-TAP output: pass through normally
  return originalWrite(chunk, encoding, cb);
};

Meteor.startup(() => {
  originalWrite(c.gray('[node-test-in-console] waiting for node:test...\n'));
});
