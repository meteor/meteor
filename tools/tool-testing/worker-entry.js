// Worker-side loop of the Phase 5 self-test parallel pool.
//
// The worker is spawned by the orchestrator (worker-pool.js) via
// `meteor self-test --as-worker <id>` so it inherits the full Meteor tool
// environment (install-runtime, isopackets, Babel transpile). The
// orchestrator then sends one IPC message per test to run and the worker
// responds with a result DTO. Workers are long-lived: they stay alive
// until the orchestrator closes the IPC channel.
//
// Shape of messages:
//   parent → worker  { type: 'run',     test: { name, file } }
//   parent → worker  { type: 'shutdown' }
//   worker → parent  { type: 'ready' }            — handshake after setup
//   worker → parent  { type: 'result',  name, file, status, durationMs,
//                                        failure? }
//   worker → parent  { type: 'missing', name, file }
//                   — the named test wasn't found in the filtered list
//
// Output (stdout/stderr of the worker) is inherited from the parent, so
// any test-level console output shows up inline prefixed by the worker
// pool (parent adds "[wN]" when forwarding). We keep the Matcher/OutputLog
// behavior unchanged, which means failure details (output tail on fail)
// are printed inside the worker process by Run.runTest, just like in the
// sequential path.

import * as files from '../fs/files';
import {
  parse as parseStackParse,
  markBottom as parseStackMarkBottom,
} from '../utils/parse-stack';
import { Console } from '../console/console.js';
import TestFailure from './test-failure.js';
import Run from './run.js';
import { getFilteredTests } from './selftest.js';

// Freeze the filtered list once per worker so every subsequent `run`
// message can look up the Test instance by {name, file} without
// re-scanning the test files.
let cachedTestList = null;

async function getTestList(filterOptions) {
  if (!cachedTestList) {
    cachedTestList = await getFilteredTests(filterOptions);
  }
  return cachedTestList;
}

function serializeFailure(failure) {
  if (!failure) {
    return null;
  }
  if (failure instanceof TestFailure) {
    const out = {
      kind: 'TestFailure',
      reason: failure.reason,
      details: {},
    };
    // Keep the subset of `details` that the sequential reporter prints.
    // `run` is a full Run instance and can't be serialized — we capture
    // only the tail lines so the orchestrator can reproduce the output.
    const d = failure.details || {};
    if (d.pattern) out.details.pattern = String(d.pattern);
    if (d.expected) out.details.expected = d.expected;
    if (d.actual) out.details.actual = d.actual;
    if (d.messages && d.messages.formatMessages) {
      out.details.formattedMessages = d.messages.formatMessages();
    }
    if (d.run && d.run.outputLog) {
      try {
        d.run.outputLog.end();
        out.details.outputLines = d.run.outputLog.get().slice(-100).map((l) => ({
          channel: l.channel,
          text: l.text,
          bare: !!l.bare,
        }));
      } catch (_) {
        out.details.outputLines = [];
      }
    }
    // Preserve the frame info the reporter uses to point at the failing
    // test source (see Run.runTest).
    try {
      const frames = parseStackParse(failure).outsideFiber || [];
      out.frame = frames.find((frame) => {
        const abs = files.pathJoin(files.getCurrentToolsDir(), frame.file);
        return files.exists(abs)
            && !abs.includes('/tools/tool-testing/');
      }) || frames[0] || null;
    } catch (_) {
      out.frame = null;
    }
    return out;
  }
  return {
    kind: 'Exception',
    message: failure.message || String(failure),
    stack: failure.stack || null,
  };
}

function sendParent(msg) {
  if (typeof process.send !== 'function') {
    throw new Error('worker-entry: process.send unavailable (not forked?)');
  }
  process.send(msg);
}

// Entry point invoked from commands.js when self-test is started with
// --as-worker <id>. Keeps the process alive on the IPC channel until the
// parent closes it or sends {type:'shutdown'}.
export async function runWorkerLoop({ workerId, filterOptions, runOptions }) {
  // Silence the interactive spinner — workers never draw UI.
  Console.setHeadless(true);

  // Eagerly build the test list so the first `run` message doesn't pay
  // the scan cost. Any failure here is fatal for the worker.
  try {
    await getTestList(filterOptions);
  } catch (err) {
    sendParent({
      type: 'fatal',
      message: `worker ${workerId} failed to load tests: ${err.message || err}`,
      stack: err.stack || null,
    });
    process.exit(2);
  }

  sendParent({ type: 'ready', workerId });

  // Handle messages sequentially inside this worker: one in-flight test
  // per worker is the whole point of the per-worker isolation. We also
  // return a Promise that only settles when the parent disconnects or
  // sends shutdown, so the self-test command handler that awaits this
  // function keeps the process alive.
  let busy = Promise.resolve();

  await new Promise((resolve) => {
    process.on('message', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'shutdown') {
        resolve();
        return;
      }
      busy = busy.then(() => handleMessage(msg, workerId, runOptions))
                 .catch((err) => {
                   sendParent({
                     type: 'fatal',
                     workerId,
                     message: err.message || String(err),
                     stack: err.stack || null,
                   });
                   process.exit(3);
                 });
    });

    process.on('disconnect', () => {
      resolve();
    });
  });
}

async function handleMessage(msg, workerId, runOptions) {
  if (msg.type !== 'run') {
    // shutdown is intercepted by the outer listener; ignore others.
    return;
  }

  const { name, file } = msg.test;
  const testList = await getTestList(msg.filterOptions || undefined);
  const test = testList.filteredTests.find(
    (t) => t.name === name && t.file === file,
  );
  if (!test) {
    sendParent({ type: 'missing', workerId, name, file });
    return;
  }

  const startedAt = Date.now();
  let failure = null;
  try {
    await Run.runTest(
      testList,
      test,
      parseStackMarkBottom(() => test.f(runOptions || {})),
      { retries: (runOptions && runOptions.retries) || 0 },
    );
    if (test.failed) {
      failure = test.failureObject || new Error('unknown failure');
    }
  } catch (err) {
    failure = err;
  }

  sendParent({
    type: 'result',
    workerId,
    name,
    file,
    durationMs: Date.now() - startedAt,
    status: failure ? 'failed' : 'passed',
    failure: serializeFailure(failure),
  });
}
