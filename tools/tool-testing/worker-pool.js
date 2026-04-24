// Phase 5 worker pool: runs self-tests across N forked Meteor processes.
//
// Why forks and not worker_threads? The Meteor tool has a lot of module-
// level state (Error.prepareStackTrace overrides from install-runtime,
// isopackets, catalog globals, sandbox.js tropohouse cache) and spawns
// child ./meteor processes per test. Threads would share FDs/signals and
// surprise us; forks inherit the env cleanly and map 1:1 to the way Run
// already spawns subprocesses.
//
// Entry point: runTestsParallel(options). The function is called from the
// self-test command when --workers > 1. It:
//   1. Filters tests with the same options the sequential path uses.
//   2. Splits them into parallel_tests and serial_tests (tag 'serial').
//   3. Forks N workers via `meteor self-test --as-worker <i>`, each with
//      a METEOR_TEST_WORKER_ID env var so sandbox/slot scope their ports.
//   4. Feeds parallel_tests to workers via IPC, collecting results.
//   5. Runs serial_tests sequentially in the orchestrator process.
//   6. Aggregates results into the parent's TestList and writes JUnit.
//
// Output: each worker inherits stdout/stderr of the orchestrator. Lines
// are line-buffered and piped through a small prefixer so the reader can
// see which worker a log came from. Retries remain inside each worker so
// the retry-on-flakiness contract is preserved per test.

import { spawn } from 'child_process';
import * as files from '../fs/files';
import { Console } from '../console/console.js';
import { getFilteredTests } from './selftest.js';
import TestFailure from './test-failure.js';
import { markBottom as parseStackMarkBottom } from '../utils/parse-stack';

const SERIAL_TAG = 'serial';

// Heuristic order: longest tests first so the tail isn't dominated by
// one slow straggler. We don't have durations at this point, so just
// keep the input order for now. Phase 8 can load worker-report.json to
// drive this smarter.
function partitionTests(filteredTests) {
  const parallel = [];
  const serial = [];
  for (const test of filteredTests) {
    if (test.tags && test.tags.includes(SERIAL_TAG)) {
      serial.push(test);
    } else {
      parallel.push(test);
    }
  }
  return { parallel, serial };
}

// One active worker. Owns a child process and a currently-running test.
class Worker {
  constructor({ index, execPath, meteorArgs, env, filterOptions, runOptions, onLine }) {
    this.index = index;
    this.execPath = execPath;
    this.meteorArgs = meteorArgs;
    this.env = env;
    this.filterOptions = filterOptions;
    this.runOptions = runOptions;
    this.onLine = onLine;
    this.child = null;
    this.readyPromise = null;
    this.current = null; // { resolve, reject, test }
    this.dead = false;
  }

  async start() {
    this.child = spawn(this.execPath, this.meteorArgs, {
      env: this.env,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    // Prefix worker output so interleaved logs are attributable.
    const prefix = `[w${this.index}] `;
    const pipeLines = (stream, sink) => {
      let buf = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          sink(prefix + line);
        }
      });
      stream.on('end', () => {
        if (buf.length) sink(prefix + buf);
      });
    };
    pipeLines(this.child.stdout, (line) => this.onLine('stdout', line));
    pipeLines(this.child.stderr, (line) => this.onLine('stderr', line));

    this.readyPromise = new Promise((resolve, reject) => {
      const onMessage = (msg) => {
        if (msg && msg.type === 'ready' && msg.workerId === this.index) {
          this.child.off('message', onMessage);
          resolve();
        } else if (msg && msg.type === 'fatal') {
          this.child.off('message', onMessage);
          reject(new Error(`worker ${this.index} fatal: ${msg.message}`));
        }
      };
      this.child.on('message', onMessage);
      this.child.on('exit', (code, signal) => {
        if (!this.readySettled) {
          this.dead = true;
          reject(new Error(
            `worker ${this.index} exited before ready (code=${code} signal=${signal})`,
          ));
        } else {
          // Died after ready — fail any in-flight test so the dispatcher
          // doesn't deadlock.
          this._onExitAfterReady(code, signal);
        }
      });
    }).then((x) => { this.readySettled = true; return x; },
            (e) => { this.readySettled = true; throw e; });

    this.child.on('message', (msg) => this._onMessage(msg));

    await this.readyPromise;
  }

  _onMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'result' || msg.type === 'missing' || msg.type === 'fatal') {
      const current = this.current;
      this.current = null;
      if (current) {
        if (msg.type === 'fatal') {
          current.reject(new Error(msg.message || 'worker fatal'));
        } else {
          current.resolve(msg);
        }
      }
    }
  }

  _onExitAfterReady(code, signal) {
    // Worker died mid-flight (e.g. crashed loading the test). Fail the
    // in-flight promise so drive() can move on instead of deadlocking.
    const current = this.current;
    this.current = null;
    this.dead = true;
    if (current) {
      current.reject(new Error(
        `worker ${this.index} died while running (code=${code} signal=${signal})`,
      ));
    }
  }

  // Returns a promise that resolves to the worker's `result`/`missing`
  // message. Rejects on worker death or protocol error.
  async run(test) {
    if (this.dead) throw new Error(`worker ${this.index} is dead`);
    if (this.current) throw new Error(`worker ${this.index} busy`);

    return new Promise((resolve, reject) => {
      this.current = { resolve, reject, test };
      this.child.send({
        type: 'run',
        test: { name: test.name, file: test.file },
        filterOptions: this.filterOptions,
      });
    });
  }

  async shutdown() {
    if (this.dead) return;
    try {
      this.child.send({ type: 'shutdown' });
    } catch (_) {
      // channel already closed
    }
    // Give it a moment, then SIGTERM.
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        try { this.child.kill('SIGTERM'); } catch (_) {}
        resolve();
      }, 1500);
      this.child.once('exit', () => { clearTimeout(t); resolve(); });
    });
  }
}

function applyResult(testList, test, result) {
  test.durationMs = result.durationMs;
  if (result.status === 'passed') {
    return;
  }
  // The worker already printed the detailed failure report via
  // Run.runTest (forwarded through our "[wN] " prefix pipe). Here we
  // only record the failure so the aggregated summary at the end of
  // the run knows about it and JUnit output reflects it.
  testList.notifyFailed(test, rehydrateFailure(result.failure));
}

function rehydrateFailure(f) {
  if (!f) return new Error('unknown failure');
  if (f.kind === 'TestFailure') {
    return new TestFailure(f.reason, f.details || {});
  }
  const err = new Error(f.message || 'failure');
  if (f.stack) err.stack = f.stack;
  return err;
}

// Run only the tests tagged "serial" inline (no workers). Used both at
// the end of a parallel run and whenever --workers <= 1.
async function runSerialInline(testList, serialTests, runOptions) {
  const total = serialTests.length;
  const Run = require('./run.js').default;
  for (let i = 0; i < total; i++) {
    const test = serialTests[i];
    Console.info(`running [serial] (${i + 1}/${total}) ${test.file}.js test:${test.name} ...`);
    await Run.runTest(
      testList,
      test,
      parseStackMarkBottom(() => test.f(runOptions || {})),
      { retries: (runOptions && runOptions.retries) || 0 },
    );
  }
}

// Public entry point. Called from commands.js when --workers > 1.
//
// options shape matches selftest.runTests, plus:
//   workers:        N parallel workers (>=2)
//   meteorExecPath: absolute path to ./meteor (so worker inherits env)
export async function runTestsParallel(options) {
  const {
    workers,
    meteorExecPath,
    retries = 0,
    historyLines,
    junit,
    ...filterOptions
  } = options;

  // Build the same filtered list the sequential path would produce.
  const testList = await getFilteredTests(filterOptions);
  if (!testList.allTests.length) {
    Console.error('No tests defined.');
    return 0;
  }

  const { parallel, serial } = partitionTests(testList.filteredTests);
  const startedAt = Date.now();

  Console.info(
    `self-test parallel: ${parallel.length} parallel + ${serial.length} serial `
    + `across ${workers} worker(s)`,
  );

  // The @meteorjs/babel transpile cache under <checkout>/.babel-cache is
  // not safe for concurrent writers — two workers recompiling the same
  // source hash at the same time race on unlink/write and one of them
  // crashes. The install-babel.js that configures it hardcodes the path
  // and ignores BABEL_CACHE_DIR, so we can't redirect per-worker.
  //
  // Mitigation: load the full worker entry graph in the parent first.
  // That forces every source file the workers will need to be compiled
  // and written to .babel-cache. When the forks start, every require
  // hits an existing, complete cache file and nobody writes → no race.
  Console.info('self-test parallel: pre-warming babel cache for workers...');
  // eslint-disable-next-line global-require
  require('./worker-entry.js');

  // Fork workers.
  const workerList = [];
  for (let i = 0; i < workers; i++) {
    const env = Object.assign({}, process.env, {
      METEOR_TEST_WORKER_ID: String(i + 1),
      // Make the worker silent about the node flags reminder.
      SELF_TEST_TOOL_NODE_FLAGS: process.env.SELF_TEST_TOOL_NODE_FLAGS || ' ',
    });
    // Worker inherits the same flags we received, plus --as-worker.
    const args = ['self-test', '--as-worker', String(i + 1), '--headless'];
    const w = new Worker({
      index: i + 1,
      execPath: meteorExecPath,
      meteorArgs: args,
      env,
      filterOptions,
      runOptions: { retries },
      onLine: (channel, line) => {
        if (channel === 'stderr') {
          process.stderr.write(line + '\n');
        } else {
          process.stdout.write(line + '\n');
        }
      },
    });
    workerList.push(w);
  }

  // Install signal handlers BEFORE waiting on workers to start, so Ctrl-C
  // during startup propagates cleanly.
  const shutdownAll = async () => {
    await Promise.all(workerList.map((w) => w.shutdown().catch(() => {})));
  };
  let interrupted = false;
  const sigintHandler = () => {
    if (interrupted) return;
    interrupted = true;
    Console.error('self-test parallel: interrupted; shutting down workers...');
    shutdownAll().finally(() => process.exit(130));
  };
  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigintHandler);

  // Start all workers in parallel.
  await Promise.all(workerList.map((w) => w.start()));

  // Dispatch parallel tests: workers pull from a shared queue.
  const queue = parallel.slice();
  let completed = 0;
  const totalParallel = queue.length;

  async function drive(worker) {
    while (!interrupted) {
      const test = queue.shift();
      if (!test) return;
      Console.info(
        `[w${worker.index}] running (${++completed}/${totalParallel}) `
        + `${test.file}.js test:${test.name} ...`,
      );
      let result;
      try {
        result = await worker.run(test);
      } catch (err) {
        Console.rawError(`[w${worker.index}] worker died: ${err.message}\n`);
        // Mark test as failed so aggregation is honest.
        testList.notifyFailed(test, err);
        return; // stop driving this worker
      }
      if (result.type === 'missing') {
        Console.rawError(
          `[w${worker.index}] test missing in worker: ${test.file}.js test:${test.name}\n`,
        );
        testList.notifyFailed(test, new Error('test missing in worker'));
        continue;
      }
      // Success output is already printed by Run.runTest inside the
      // worker (and forwarded with the "[wN] " prefix). Only emit from
      // the orchestrator side on failure, where we need to render the
      // serialized failure DTO that the worker shipped back.
      applyResult(testList, test, result);
    }
  }

  await Promise.all(workerList.map(drive));

  // Shut down the pool before running the serial phase so the worker
  // processes release their ports/mongo. We keep the signal handlers
  // attached until the full run finishes.
  await shutdownAll();

  // Serial phase in the orchestrator process.
  if (serial.length && !interrupted) {
    await runSerialInline(testList, serial, { retries });
  }

  process.off('SIGINT', sigintHandler);
  process.off('SIGTERM', sigintHandler);

  testList.endTime = new Date();
  testList.startTime = new Date(startedAt);
  testList.durationMs = testList.endTime - testList.startTime;

  testList.saveTestState();
  if (junit) {
    testList.saveJUnitOutput(junit);
  }

  Console.error();
  Console.error(testList.generateSkipReport());

  const failureCount = testList.failedTests.length;
  if (!failureCount) {
    Console.error('All other tests passed.');
    return 0;
  }
  Console.error(`${failureCount} failure${failureCount > 1 ? 's' : ''}:`);
  for (const t of testList.failedTests) {
    Console.rawError(`  - ${t.file}.js: test:${t.name}\n`);
  }
  return 1;
}
