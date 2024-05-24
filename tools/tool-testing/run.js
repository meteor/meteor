// Represents a test run of the tool (except we also use it in
// tests/old.js to run Node scripts). Typically created through the
// run() method on Sandbox, but can also be created directly, say if
// you want to do something other than invoke the 'meteor' command in
// a nice sandbox.
//
// Options: args, cwd, env
//
// The 'execPath' argument and the 'cwd' option are assumed to be standard
// paths.
//
// Arguments in the 'args' option are not assumed to be standard paths, so
// calling any of the 'files.*' methods on them is not safe.
import { spawn } from 'child_process';
import * as files from '../fs/files';
import {
  parse as parseStackParse,
} from '../utils/parse-stack';
import { Console } from '../console/console.js';
import Matcher from './matcher.js';
import OutputLog from './output-log.js';
import { randomPort, timeoutScaleFactor, sleepMs } from '../utils/utils.js';
import TestFailure from './test-failure.js';
import { execFileAsync } from '../utils/processes';

let runningTest = null;

export default class Run {
  constructor(execPath, options) {
    this.execPath = execPath;
    this.cwd = options.cwd || files.convertToStandardPath(process.cwd());
    // default env variables
    this.env = Object.assign({ SELFTEST: "t", METEOR_NO_WORDWRAP: "t" }, options.env);
    this._args = [];
    this.proc = null;
    this.baseTimeout = 20;
    this.extraTime = 0;
    this.client = options.client;

    this.stdoutMatcher = new Matcher(this);
    this.stderrMatcher = new Matcher(this);
    this.outputLog = new OutputLog(this);

    this.matcherEndPromise = null;

    this.exitStatus = undefined; // 'null' means failed rather than exited
    this.exitPromiseResolvers = [];
    const opts = options.args || [];
    this.args.apply(this, opts || []);

    this.fakeMongoPort = null;
    this.fakeMongoConnection = null;
    if (options.fakeMongo) {
      this.fakeMongoPort = randomPort();
      this.env.METEOR_TEST_FAKE_MONGOD_CONTROL_PORT = this.fakeMongoPort;
    }

    runningTest.onCleanup(() => {
      this._stopWithoutWaiting();
    });
  }

  // Set command-line arguments. This may be called multiple times as
  // long as the run has not yet started (the run starts after the
  // first call to a function that requires it, like match()).
  //
  // Pass as many arguments as you want. Non-object values will be
  // cast to string, and object values will be treated as maps from
  // option names to values.
  args(...args) {
    if (this.proc) {
      throw new Error("already started?");
    }

    args.forEach((a) => {
      if (typeof a !== "object") {
        this._args.push(`${a}`);
      } else {
        Object.keys(a).forEach((key) => {
          const value = a[key];
          this._args.push(`--${key}`);
          this._args.push(`${value}`);
        });
      }
    });
  }

  connectClient() {
    if (!this.client) {
      throw new Error("Must create Run with a client to use connectClient().");
    }

    this._ensureStarted();
    this.client.connect();
  }

  // Useful for matching one-time patterns not sensitive to ordering.
  matchBeforeExit(pattern) {
    return this.stdoutMatcher.matchBeforeEnd(pattern);
  }

  matchErrBeforeExit(pattern) {
    return this.stderrMatcher.matchBeforeEnd(pattern);
  }

  _exited(status) {
    if (this.exitStatus !== undefined) {
      throw new Error("already exited?");
    }

    if (this.client) {
      this.client.stop();
    }

    this.exitStatus = status;
    const exitPromiseResolvers = this.exitPromiseResolvers;
    this.exitPromiseResolvers = null;
    exitPromiseResolvers.forEach((resolve) => {
      resolve();
    });

    this._endMatchers();
  }

  _endMatchers() {
    this.matcherEndPromise =
      this.matcherEndPromise || Promise.all([
        this.stdoutMatcher.endAsync(),
        this.stderrMatcher.endAsync()
      ]);
    return this.matcherEndPromise;
  }

  _ensureStarted() {
    if (this.proc) {
      return;
    }

    const env = Object.assign(Object.create(null), process.env);
    Object.assign(env, this.env);

    this.proc = spawn(files.convertToOSPath(this.execPath),
      this._args, {
        cwd: files.convertToOSPath(this.cwd),
        env,
        ...process.platform === 'win32' && { shell: true },
      });

    this.proc.on('close', (code, signal) => {
      if (this.exitStatus === undefined) {
        this._exited({ code, signal });
      }
    });

    this.proc.on('exit', (code, signal) => {
      if (this.exitStatus === undefined) {
        this._exited({ code, signal });
      }
    });

    this.proc.on('error', (err) => {
      if (this.exitStatus === undefined) {
        this._exited(null);
      }
    });

    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (data) => {
      this.outputLog.write('stdout', data);
      this.stdoutMatcher.write(data);
    });

    this.proc.stderr.setEncoding('utf8');
    this.proc.stderr.on('data', (data) => {
      this.outputLog.write('stderr', data);
      this.stderrMatcher.write(data);
    });
  }

  // Wait until we get text on stdout that matches 'pattern', which
  // may be a regular expression or a string. Consume stdout up to
  // that point. If this pattern does not appear after a timeout (or
  // the program exits before emitting the pattern), fail.
  match(pattern, _strict) {
    this._ensureStarted();

    let timeout = this.baseTimeout + this.extraTime;
    timeout *= timeoutScaleFactor;
    this.extraTime = 0;
    Console.simpleDebug('match', pattern);
    return this.stdoutMatcher.match(pattern, timeout, _strict);
  }

  getMatcherFullBuffer() {
    return this.stdoutMatcher.getFullBuffer();
  }

  // As expect(), but for stderr instead of stdout.
  matchErr(pattern, _strict) {
    this._ensureStarted();

    let timeout = this.baseTimeout + this.extraTime;
    timeout *= timeoutScaleFactor;
    this.extraTime = 0;
    Console.simpleDebug('matchErr', pattern);
    return this.stderrMatcher.match(pattern, timeout, _strict);
  }

  // Like match(), but won't skip ahead looking for a match. It must
  // follow immediately after the last thing we matched or read.
  read(pattern, strict = true) {
    return this.match(pattern, strict);
  }

  // As read(), but for stderr instead of stdout.
  readErr(pattern) {
    return this.matchErr(pattern, true);
  }

  // Assert that 'pattern' (again, a regexp or string) has not
  // occurred on stdout at any point so far in this run. Currently
  // this works on complete lines, so unlike match() and read(),
  // 'pattern' cannot span multiple lines, and furthermore if it is
  // called before the end of the program, it may not see text on a
  // partially read line. We could lift these restrictions easily, but
  // there may not be any benefit since the usual way to use this is
  // to call it after expectExit or expectEnd.
  //
  // Example:
  // run = s.run("--help");
  // run.expectExit(1);  // <<-- important to actually run the command
  // run.forbidErr("unwanted string"); // <<-- important to run **after** the
  //                                   // command ran the process.
  forbid(pattern) {
    this._ensureStarted();
    this.outputLog.forbid(pattern, 'stdout');
  }

  // As forbid(), but for stderr instead of stdout.
  forbidErr(pattern) {
    this._ensureStarted();
    this.outputLog.forbid(pattern, 'stderr');
  }

  // Combination of forbid() and forbidErr(). Forbids the pattern on
  // both stdout and stderr.
  forbidAll(pattern) {
    this._ensureStarted();
    this.outputLog.forbid(pattern);
  }

  // Expect the program to exit without anything further being
  // printed on either stdout or stderr.
  async expectEnd() {
    this._ensureStarted();

    let timeout = this.baseTimeout + this.extraTime;
    timeout *= timeoutScaleFactor;
    this.extraTime = 0;
    await this.expectExit();

    this.stdoutMatcher.matchEmpty();
    this.stderrMatcher.matchEmpty();
  }

  // Expect the program to exit with the given (numeric) exit
  // status. Fail if the process exits with a different code, or if
  // the process does not exit after a timeout. You can also omit the
  // argument to simply wait for the program to exit.
  async expectExit(code) {
    this._ensureStarted();

    await this._endMatchers();

    if (this.exitStatus === undefined) {
      let timeout = this.baseTimeout + this.extraTime;
      timeout *= timeoutScaleFactor;
      this.extraTime = 0;

      let timer;
      const failure = new TestFailure('exit-timeout', { run: this });
      const promise = new Promise((resolve, reject) => {
        this.exitPromiseResolvers.push(resolve);
        timer = setTimeout(() => {
          this.exitPromiseResolvers =
            this.exitPromiseResolvers.filter(r => r !== resolve);
          reject(failure);
        }, timeout * 1000);
      });

      try {
        await promise;
      } finally {
        clearTimeout(timer);
      }
    }

    if (! this.exitStatus) {
      throw new TestFailure('spawn-failure', { run: this });
    }
    if (code !== undefined && this.exitStatus.code !== code) {
      throw new TestFailure('wrong-exit-code', {
        expected: { code },
        actual: this.exitStatus,
        run: this,
      });
    }
  }

  // Extend the timeout for the next operation by 'secs' seconds.
  waitSecs(secs) {
    this.extraTime += secs;
  }

  // Send 'string' to the program on its stdin.
  write(string) {
    this._ensureStarted();
    this.proc.stdin.write(string);
  }

  // Kill the program and then wait for it to actually exit.
  async stop() {
    if (this.exitStatus === undefined) {
      this._ensureStarted();
      if (this.client) {
        this.client.stop();
      }
      await this._killProcess();
      await this.expectExit();
    }
  }

  // Like stop, but doesn't wait for it to exit.
  _stopWithoutWaiting() {
    if (this.exitStatus === undefined && this.proc) {
      if (this.client) {
        this.client.stop();
      }
      this._killProcess();
    }
  }

  // Kills the running process and it's child processes
  async _killProcess() {
    if (!this.proc) {
      throw new Error("Unexpected: `this.proc` undefined when calling _killProcess");
    }

    if (process.platform === "win32") {
      // looks like in Windows `this.proc.kill()` doesn't kill child
      // processes.
      await execFileAsync("taskkill", ["/pid", this.proc.pid, '/f', '/t']);
    } else {
      this.proc.kill();
    }
  }

  // If the fakeMongo option was set, sent a command to the stub
  // mongod. Available commands currently are:
  //
  // - { stdout: "xyz" } to make fake-mongod write "xyz" to stdout
  // - { stderr: "xyz" } likewise for stderr
  // - { exit: 123 } to make fake-mongod exit with code 123
  //
  // Blocks until a connection to fake-mongod can be
  // established. Throws a TestFailure if it cannot be established.
  async tellMongo(command) {
    if (! this.fakeMongoPort) {
      throw new Error("fakeMongo option on sandbox must be set");
    }

    this._ensureStarted();

    // If it's the first time we've called tellMongo on this sandbox,
    // open a connection to fake-mongod. Wait up to 60 seconds for it
    // to accept the connection, retrying every 100ms.
    //
    // XXX we never clean up this connection. Hopefully once
    // fake-mongod has dropped its end of the connection, and we hold
    // no reference to our end, it will get gc'd. If not, that's not
    // great, but it probably doesn't actually create any practical
    // problems since this is only for testing.
    if (! this.fakeMongoConnection) {
      const net = require('net');

      let lastStartTime = 0;
      for (
        let attempts = 0;
        !this.fakeMongoConnection && attempts < 600;
        attempts++
      ) {
        // Throttle attempts to one every 100ms
        await sleepMs((lastStartTime + 100) - (+ new Date()));
        lastStartTime = +(new Date());

        await new Promise((resolve) => {
          // This is all arranged so that if a previous attempt
          // belatedly succeeds, somehow, we ignore it.
          const conn = net.connect(this.fakeMongoPort, () => {
            if (resolve) {
              this.fakeMongoConnection = conn;
              resolve(true);
              resolve = null;
            }
          });
          conn.setNoDelay();
          function fail() {
            if (resolve) {
              resolve(false);
              resolve = null;
            }
          }
          conn.on('error', fail);
          setTimeout(fail, 100); // 100ms connection timeout
        });
      }

      if (!this.fakeMongoConnection) {
        throw new TestFailure("mongo-not-running", { run: this });
      }
    }

    this.fakeMongoConnection.write(`${JSON.stringify(command)}\n`);
    // If we told it to exit, then we should close our end and connect again if
    // asked to send more.
    if (command.exit) {
      this.fakeMongoConnection.end();
      this.fakeMongoConnection = null;
    }
  }

  static async runTest(testList, test, testRunner, options = {}) {
    options.retries = options.retries || 0;

    let failure = null;
    let startTime;
    try {
      runningTest = test;
      startTime = +(new Date);
      // ensure we mark the bottom of the stack each time we start a new test
      await testRunner();
    } catch (e) {
      failure = e;
    } finally {
      runningTest = null;
      await test.cleanup();
    }

    test.durationMs = +(new Date) - startTime;

    if (failure) {
      let checkmark;
      if (process.platform === "win32") {
        checkmark = 'FAIL';
      } else {
        checkmark = '\u2717'; // CROSS
      }

      Console.error(`... fail! (${test.durationMs} ms)`, Console.options({ bulletPoint: `${checkmark} ` }));

      if (failure instanceof TestFailure) {
        const frames = parseStackParse(failure).outsideFiber;
        const toolsDir = files.getCurrentToolsDir();
        let pathWithLineNumber;
        frames.some(frame => {
          // The parsed stack trace will typically include frame.file
          // strings of the form "/tools/tests/whatever.js", which can be
          // made absolute by joining them with toolsDir. If the resulting
          // absPath exists, then we know we interpreted the frame.file
          // correctly, and we can normalize away the leading '/'
          // character to get a safe relative path.
          const absPath = files.pathJoin(toolsDir, frame.file);
          if (files.exists(absPath)) {
            const relPath = files.pathRelative(toolsDir, absPath);
            const parts = relPath.split("/");
            if (parts[0] === "tools" &&
                parts[1] === "tool-testing") {
              // Ignore frames inside the /tools/tool-testing directory,
              // like run.js and selftest.js.
              return false;
            }
            pathWithLineNumber = `${relPath}:${frame.line}`;
            return true;
          }
          // If frame.file was not joinable with toolsDir to obtain an
          // absolute path that exists, show it to the user without trying
          // to interpret what it means.
          pathWithLineNumber = `${frame.file}:${frame.line}`;
          return true;
        });

        Console.rawError(
          ` => Failure Reason: "${failure.reason}" at "${pathWithLineNumber}"\n`);
        if (failure.reason === 'no-match' || failure.reason === 'junk-before' ||
            failure.reason === 'match-timeout') {
          Console.arrowError(`Pattern: "${failure.details.pattern}"`, 2);
        }
        if (failure.reason === "wrong-exit-code") {
          const s = status => `${status.signal || status.code || "???"}`;

          Console.rawError(
            `  => Expected: "${s(failure.details.expected)}"` +
            `; actual: "${s(failure.details.actual)}"\n`);
        }
        if (failure.reason === 'expected-exception') {
        }
        if (failure.reason === 'not-equal') {
          Console.rawError(
            `  => Expected: "${JSON.stringify(failure.details.expected)}"; 
            actual: "${JSON.stringify(failure.details.actual)}"`);
        }

        if (failure.details.run) {
          failure.details.run.outputLog.end();
          const lines = failure.details.run.outputLog.get();
          if (! lines.length) {
            Console.arrowError("No output", 2);
          } else {
            const historyLines = options.historyLines || 100;

            Console.arrowError(`Last ${historyLines} lines:`, 2);
            lines.slice(-historyLines).forEach((line) => {
              Console.rawError("  " +
                               (line.channel === "stderr" ? "2| " : "1| ") +
                               line.text +
                               (line.bare ? "%" : "") + "\n");
            });
          }
        }

        if (failure.details.messages) {
          Console.arrowError("Errors while building:", 2);
          Console.rawError(failure.details.messages.formatMessages() + "\n");
        }
      } else {
        Console.rawError(`  => Test threw exception: ${failure.stack}\n`);
      }

      if (options.retries > 0) {
        Console.error(
          "... retrying (" +
          options.retries +
          (options.retries === 1 ? " try" : " tries") +
          " remaining) ...",
          Console.options({ indent: 2 })
        );

        options.retries--;

        return this.runTest(testList, test, testRunner, options);
      }

      testList.notifyFailed(test, failure);
    } else {
      Console.success(`... ok! (${test.durationMs} ms)`);
    }
  }
}

import { markThrowingMethods } from "./test-utils.js";
markThrowingMethods(Run.prototype);
