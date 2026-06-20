// test-in-node driver — runs in the isobuild bundle (server-only).
// Sets up the shared completion state on globalThis (the reporter, loaded outside the
// bundle via --test-reporter, forwards node:test events to state.onEvent). Completion is
// structured: a root after() sets the barrier, and we finalize OUTSIDE the hook once the
// reporter has seen every enqueued item complete. No debounce, no stdout parsing, no beforeExit.
//
// CommonJS on purpose: loadable directly by Node (for pure-Node smoke tests) AND by isobuild.
const { after } = require('node:test');

const c = {
  green: s => `\x1b[32m${s}\x1b[0m`, red: s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`, gray: s => `\x1b[90m${s}\x1b[0m`, bold: s => `\x1b[1m${s}\x1b[0m`,
};

// Reuse (||) the object the reporter may have created at process start — do NOT replace
// it, or we lose its buffered pendingEvents and break the reporter's captured reference.
const state = (globalThis.__meteorTestInNode = globalThis.__meteorTestInNode || { pendingEvents: [] });
state.enqueued = state.enqueued || 0;
state.completed = state.completed || 0;
state.tests = state.tests || 0;
state.suites = state.suites || 0;
state.passed = state.passed || 0;
state.failed = state.failed || 0;
state.skipped = state.skipped || 0;
state.todo = state.todo || 0;
state.rootAfterReached = state.rootAfterReached || false;
state.finalized = state.finalized || false;
state.pendingEvents = state.pendingEvents || [];

// suite vs test is in data.details.type on test:complete — reliable at every nesting depth.
function isSuite(d) { return (d && d.details && d.details.type) === 'suite'; }

state.onEvent = function (event) {
  const d = event.data || {};
  switch (event.type) {
    case 'test:enqueue':
      state.enqueued++;
      break;
    case 'test:complete':              // terminal for EVERY outcome → completed never stalls
      state.completed++;
      if (isSuite(d)) { state.suites++; break; }  // suites carry details.passed too — exclude
      state.tests++;                              //   them from the pass/fail tally (no double-count)
      if (d.skip) state.skipped++;                // NB: skipped/todo also have details.passed:true,
      else if (d.todo) state.todo++;              //     so skip/todo MUST be checked before passed.
      else if (d.details && d.details.passed) state.passed++;
      else state.failed++;                        // real failure OR cancelled/interrupted
      break;
  }
  maybeFinalize();
};

after(() => { state.rootAfterReached = true; maybeFinalize(); });

// Drain events the reporter buffered before onEvent existed (reporter attaches at process
// start; this driver arrives later via the bundle). Synchronous — no event interleaves.
{
  const buffered = state.pendingEvents;
  state.pendingEvents = [];
  for (const e of buffered) state.onEvent(e);
}

function maybeFinalize() {
  if (state.finalized) return;
  if (!(state.rootAfterReached && state.enqueued > 0 && state.completed === state.enqueued)) return;
  state.finalized = true;
  const parts = [];
  if (state.passed)  parts.push(c.green(`${state.passed} passed`));
  if (state.failed)  parts.push(c.red(`${state.failed} failed`));
  if (state.skipped) parts.push(c.yellow(`${state.skipped} skipped`));
  if (state.todo)    parts.push(c.gray(`${state.todo} todo`));
  process.stdout.write(
    `\n${c.bold('test-in-node')} ${c.gray('· node:test')}\n  ` +
    (parts.join(', ') || c.gray('no assertions')) +
    c.gray(` (${state.tests} tests)`) + '\n\n',
  );
  process.exit(state.failed > 0 ? 1 : 0);   // finalize OUTSIDE the after() hook
}
