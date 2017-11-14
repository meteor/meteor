import { inspect } from 'util';
import * as files from '../fs/files.js';
import { createHash } from 'crypto';
import {
  markBottom as parseStackMarkBottom,
  markTop as parseStackMarkTop,
  parse as parseStackParse,
} from '../utils/parse-stack.js';
import { Console } from '../console/console.js';
import { loadIsopackage } from '../tool-env/isopackets.js';
import TestFailure from './test-failure.js';
import { setRunningTest } from './run.js';

// These are accessed through selftest directly on many tests.
export { default as Sandbox } from './sandbox.js';
export { default as Run } from './run.js';

import "../tool-env/install-runtime.js";

// To allow long stack traces that cross async boundaries
import 'longjohn';

// Use this to decorate functions that throw TestFailure. Decorate the
// first function that should not be included in the call stack shown
// to the user.
export const markStack = parseStackMarkTop;

// Call from a test to throw a TestFailure exception and bail out of the test
export const fail = parseStackMarkTop(function (reason) {
  throw new TestFailure(reason);
});

// Call from a test to assert that 'actual' is equal to 'expected',
// with 'actual' being the value that the test got and 'expected'
// being the expected value
export const expectEqual = parseStackMarkTop(function (actual, expected) {
  if (! loadIsopackage('ejson').EJSON.equals(actual, expected)) {
    throw new TestFailure("not-equal", {
      expected,
      actual,
    });
  }
});

// Call from a test to assert that 'actual' is truthy.
export const expectTrue = parseStackMarkTop(function (actual) {
  if (! actual) {
    throw new TestFailure('not-true');
  }
});

// Call from a test to assert that 'actual' is falsey.
export const expectFalse = parseStackMarkTop(function (actual) {
  if (actual) {
    throw new TestFailure('not-false');
  }
});

export const expectThrows = parseStackMarkTop(function (f) {
  let threw = false;
  try {
    f();
  } catch (e) {
    threw = true;
  }

  if (! threw) {
    throw new TestFailure("expected-exception");
  }
});

class Test {
  constructor(options) {
    this.name = options.name;
    this.file = options.file;
    this.fileHash = options.fileHash;
    this.tags = options.tags || [];
    this.f = options.func;
    this.durationMs = null;
    this.cleanupHandlers = [];
  }

  onCleanup(cleanupHandler) {
    this.cleanupHandlers.push(cleanupHandler);
  }

  cleanup() {
    this.cleanupHandlers.forEach((cleanupHandler) => {
      cleanupHandler();
    });
    this.cleanupHandlers = [];
  }
}

let allTests = null;
let fileBeingLoaded = null;
let fileBeingLoadedHash = null;

const getAllTests = () => {
  if (allTests) {
    return allTests;
  }
  allTests = [];

  // Load all files in the 'tests' directory that end in .js. They
  // are supposed to then call define() to register their tests.
  const testdir = files.pathJoin(__dirname, '..', 'tests');
  const filenames = files.readdir(testdir);
  filenames.forEach((n) => {
    if (! n.match(/^[^.].*\.js$/)) {
      // ends in '.js', doesn't start with '.'
      return;
    }
    try {
      if (fileBeingLoaded) {
        throw new Error("called recursively?");
      }
      fileBeingLoaded = files.pathBasename(n, '.js');

      const fullPath = files.pathJoin(testdir, n);
      const contents = files.readFile(fullPath, 'utf8');
      fileBeingLoadedHash = createHash('sha1').update(contents).digest('hex');

      require(files.pathJoin(testdir, n));
    } finally {
      fileBeingLoaded = null;
      fileBeingLoadedHash = null;
    }
  });

  return allTests;
};

export function define(name, tagsList, f) {
  if (typeof tagsList === "function") {
    // tagsList is optional
    f = tagsList;
    tagsList = [];
  }

  const tags = tagsList.slice();
  tags.sort();

  allTests.push(new Test({
    name,
    tags,
    file: fileBeingLoaded,
    fileHash: fileBeingLoadedHash,
    func: f,
  }));
}

///////////////////////////////////////////////////////////////////////////////
// Choosing tests
///////////////////////////////////////////////////////////////////////////////

const tagDescriptions = {
  checkout: 'can only run from checkouts',
  net: 'require an internet connection',
  slow: 'take quite a long time; use --slow to include',
  galaxy: 'galaxy-specific test testing galaxy integration',
  cordova: 'requires Cordova support in tool (eg not on Windows)',
  windows: 'runs only on Windows',
  // these are pseudo-tags, assigned to tests when you specify
  // --changed, --file, or a pattern argument
  unchanged: 'unchanged since last pass',
  'non-matching': "don't match specified pattern",
  'in other files': "",
  // These tests require a setup step which can be amortized across multiple
  // similar tests, so it makes sense to segregate them
  'custom-warehouse': "requires a custom warehouse",
};

// Returns a TestList object representing a filtered list of tests,
// according to the options given (which are based closely on the
// command-line arguments).  Used as the first step of both listTests
// and runTests.
//
// Options: testRegexp, fileRegexp, onlyChanged, offline, includeSlowTests, galaxyOnly
function getFilteredTests(options) {
  options = options || {};
  let allTests = getAllTests();
  let testState;

  if (allTests.length) {
    testState = readTestState();

    // Add pseudo-tags 'non-matching', 'unchanged', 'non-galaxy' and 'in other
    // files' (but only so that we can then skip tests with those tags)
    allTests = allTests.map((test) => {
      const newTags = [];

      if (options.fileRegexp && ! options.fileRegexp.test(test.file)) {
        newTags.push('in other files');
      } else if (options.testRegexp && ! options.testRegexp.test(test.name)) {
        newTags.push('non-matching');
      } else if (options.onlyChanged &&
                 test.fileHash === testState.lastPassedHashes[test.file]) {
        newTags.push('unchanged');
      } else if (options.excludeRegexp &&
                 options.excludeRegexp.test(test.name)) {
        newTags.push('excluded');
      }

      // We make sure to not run galaxy tests unless the user explicitly asks us
      // to. Someday, this might not be the case.
      if (! test.tags.includes("galaxy")) {
        newTags.push('non-galaxy');
      }

      if (! newTags.length) {
        return test;
      }

      return Object.assign(
        Object.create(Object.getPrototypeOf(test)),
        test,
        {
          tags: test.tags.concat(newTags),
        }
      );
    });
  }

  // (order of tags is significant to the "skip counts" that are displayed)
  const tagsToSkip = [];
  if (options.fileRegexp) {
    tagsToSkip.push('in other files');
  }
  if (options.testRegexp) {
    tagsToSkip.push('non-matching');
  }
  if (options.excludeRegexp) {
    tagsToSkip.push('excluded');
  }
  if (options.onlyChanged) {
    tagsToSkip.push('unchanged');
  }
  if (! files.inCheckout()) {
    tagsToSkip.push('checkout');
  }
  if (options.galaxyOnly) {
    // We consider `galaxy` to imply `slow` and `net` since almost all galaxy
    // tests involve deploying an app to a (probably) remote server.
    tagsToSkip.push('non-galaxy');
  } else {
    tagsToSkip.push('galaxy');
    if (options.offline) {
      tagsToSkip.push('net');
    }
    if (! options.includeSlowTests) {
      tagsToSkip.push('slow');
    }
  }

  if (options['without-tag']) {
    tagsToSkip.push(options['without-tag']);
  }

  if (process.platform === "win32") {
    tagsToSkip.push("cordova");
    tagsToSkip.push("yet-unsolved-windows-failure");
  } else {
    tagsToSkip.push("windows");
  }

  const tagsToMatch = options['with-tag'] ? [options['with-tag']] : [];
  return new TestList(allTests, tagsToSkip, tagsToMatch, testState);
};

function groupTestsByFile(tests) {
  const grouped = {};
  tests.forEach((test) => {
    grouped[test.file] = grouped[test.file] || [];
    grouped[test.file].push(test);
  });

  return grouped;
}

// A TestList is the result of getFilteredTests.  It holds the original
// list of all tests, the filtered list, and stats on how many tests
// were skipped (see generateSkipReport).
//
// TestList also has code to save the hashes of files where all tests
// ran and passed (for the `--changed` option).  If a testState is
// provided, the notifyFailed and saveTestState can be used to modify
// the testState appropriately and write it out.
class TestList {
  constructor(allTests, tagsToSkip, tagsToMatch, testState) {
    tagsToSkip = (tagsToSkip || []);
    testState = (testState || null); // optional
    this.allTests = allTests;
    this.skippedTags = tagsToSkip;
    this.skipCounts = {};
    this.testState = testState;

    tagsToSkip.forEach((tag) => {
      this.skipCounts[tag] = 0;
    });

    this.fileInfo = {}; // path -> {hash, hasSkips, hasFailures}

    this.filteredTests = allTests.filter((test) => {

      if (! this.fileInfo[test.file]) {
        this.fileInfo[test.file] = {
          hash: test.fileHash,
          hasSkips: false,
          hasFailures: false
        };
      }
      const fileInfo = this.fileInfo[test.file];

      if (tagsToMatch.length) {
        const matches = tagsToMatch.some((tag) => test.tags.includes(tag));
        if (!matches) {
          return false;
        }
      }

      // We look for tagsToSkip *in order*, and when we decide to
      // skip a test, we don't keep looking at more tags, and we don't
      // add the test to any further "skip counts".
      return !tagsToSkip.some((tag) => {
        if (test.tags.includes(tag)) {
          this.skipCounts[tag]++;
          fileInfo.hasSkips = true;
          return true;
        } else {
          return false;
        }
      });
    });
  }

  // Mark a test's file as having failures.  This prevents
  // saveTestState from saving its hash as a potentially
  // "unchanged" file to be skipped in a future run.
  notifyFailed(test, failureObject) {
    // Mark the file that this test lives in as having failures.
    this.fileInfo[test.file].hasFailures = true;

    // Mark that the specific test failed.
    test.failed = true;

    // If there is a failure object, store that for potential output.
    if (failureObject) {
      test.failureObject = failureObject;
    }
  }

  saveJUnitOutput(path) {
    const grouped = groupTestsByFile(this.filteredTests);

    // We'll form an collection of "testsuites"
    const testSuites = [];

    const attrSafe = attr => (attr || "").replace('"', "&quot;");
    const durationForOutput = durationMs => durationMs / 1000;

    // Each file is a testsuite.
    Object.keys(grouped).forEach((file) => {
      const testCases = [];

      let countError = 0;
      let countFailure = 0;

      // Each test is a "testcase".
      grouped[file].forEach((test) => {
        const testCaseAttrs = [
          `name="${attrSafe(test.name)}"`,
        ];

        if (test.durationMs) {
          testCaseAttrs.push(`time="${durationForOutput(test.durationMs)}"`);
        }

        const testCaseAttrsString = testCaseAttrs.join(' ');

        if (test.failed) {
          let failureElement = "";

          if (test.failureObject instanceof TestFailure) {
            countFailure++;

            failureElement = [
              `<error type="${test.failureObject.reason}">`,
              '<![CDATA[',
              inspect(test.failureObject.details, { depth: 4 }),
              ']]>',
              '</error>',
            ].join('\n');
          } else if (test.failureObject && test.failureObject.stack) {
            countError++;

            failureElement = [
              '<failure>',
              '<![CDATA[',
              test.failureObject.stack,
              ']]>',
              '</failure>',
            ].join('\n');
          } else {
            countError++;

            failureElement = '<failure />';
          }

          testCases.push(
            [
              `<testcase ${testCaseAttrsString}>`,
              failureElement,
              '</testcase>',
            ].join('\n'),
          );
        } else {
          testCases.push(`<testcase ${testCaseAttrsString}/>`);
        }
      });

      const testSuiteAttrs = [
        `name="${file}"`,
        `tests="${testCases.length}"`,
        `failures="${countFailure}"`,
        `errors="${countError}"`,
        `time="${durationForOutput(this.durationMs)}"`,
      ];

      const testSuiteAttrsString = testSuiteAttrs.join(' ');

      testSuites.push(
        [
          `<testsuite ${testSuiteAttrsString}>`,
          testCases.join('\n'),
          '</testsuite>',
        ].join('\n'),
      );
    });

    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';

    const testSuitesString = testSuites.join('\n');

    files.writeFile(path,
      [
        xmlHeader,
        `<testsuites>`,
        testSuitesString,
        `</testsuites>`,
      ].join('\n'),
      'utf8',
    );
  }

  // If this TestList was constructed with a testState,
  // modify it and write it out based on which tests
  // were skipped and which tests had failures.
  saveTestState() {
    const testState = this.testState;
    if (! (testState && this.filteredTests.length)) {
      return;
    }

    Object.keys(this.fileInfo).forEach((f) => {
      const info = this.fileInfo[f];
      if (info.hasFailures) {
        delete testState.lastPassedHashes[f];
      } else if (! info.hasSkips) {
        testState.lastPassedHashes[f] = info.hash;
      }
    });

    writeTestState(testState);
  }

  // Return a string like "Skipped 1 foo test\nSkipped 5 bar tests\n"
  generateSkipReport() {
    let result = '';

    this.skippedTags.forEach((tag) => {
      const count = this.skipCounts[tag];
      if (count) {
        const noun = "test" + (count > 1 ? "s" : ""); // "test" or "tests"
        // "non-matching tests" or "tests in other files"
        const nounPhrase = (/ /.test(tag) ?
                          (noun + " " + tag) : (tag + " " + noun));
        // " (foo)" or ""
        const parenthetical = (tagDescriptions[tag] ? " (" +
                            tagDescriptions[tag] + ")" : '');
        result += ("Skipped " + count + " " + nounPhrase + parenthetical + '\n');
      }
    });

    return result;
  }
}

function getTestStateFilePath() {
  return files.pathJoin(files.getHomeDir(), '.meteortest');
};

function readTestState() {
  const testStateFile = getTestStateFilePath();
  let testState;
  if (files.exists(testStateFile)) {
    testState = JSON.parse(files.readFile(testStateFile, 'utf8'));
  }
  if (! testState || testState.version !== 1) {
    testState = { version: 1, lastPassedHashes: {} };
  }
  return testState;
};

function writeTestState(testState) {
  const testStateFile = getTestStateFilePath();
  files.writeFile(testStateFile, JSON.stringify(testState), 'utf8');
}

// Same options as getFilteredTests.  Writes to stdout and stderr.
export function listTests(options) {
  const testList = getFilteredTests(options);

  if (! testList.allTests.length) {
    Console.error("No tests defined.\n");
    return;
  }

  const grouped = groupTestsByFile(testList.filteredTests);

  Object.keys(grouped).forEach((file) => {
    Console.rawInfo(file + ':\n');
    grouped[file].forEach((test) => {
      Console.rawInfo('  - ' + test.name +
                      (test.tags.length ? ' [' + test.tags.join(' ') + ']'
                      : '') + '\n');
    });
  });

  Console.error();
  Console.error(testList.filteredTests.length + " tests listed.");
  Console.error(testList.generateSkipReport());
}

///////////////////////////////////////////////////////////////////////////////
// Running tests
///////////////////////////////////////////////////////////////////////////////

// options: onlyChanged, offline, includeSlowTests, historyLines, testRegexp,
//          fileRegexp,
//          clients:
//             - browserstack (need s3cmd credentials)
export function runTests(options) {
  const testList = getFilteredTests(options);

  if (! testList.allTests.length) {
    Console.error("No tests defined.");
    return 0;
  }

  testList.startTime = new Date;

  let totalRun = 0;
  const failedTests = [];

  testList.filteredTests.forEach((test) => {
    totalRun++;
    Console.error(test.file + ": " + test.name + " ... ");
    runTest(test);
  });

  testList.endTime = new Date;
  testList.durationMs = testList.endTime - testList.startTime;

  function runTest(test, tries = 3) {
    let failure = null;
    let startTime;
    try {
      setRunningTest(test);
      startTime = +(new Date);
      // ensure we mark the bottom of the stack each time we start a new test
      parseStackMarkBottom(() => {
        test.f(options);
      })();
    } catch (e) {
      failure = e;
    } finally {
      setRunningTest(null);
      test.cleanup();
    }

    test.durationMs = +(new Date) - startTime;

    if (failure) {
      Console.error("... fail!", Console.options({ indent: 2 }));

      if (--tries > 0) {
        Console.error(
          "... retrying (" + tries + (tries === 1 ? " try" : " tries") + " remaining) ...",
          Console.options({ indent: 2 })
        );

        return runTest(test, tries);
      }

      if (failure instanceof TestFailure) {
        const frames = parseStackParse(failure).outsideFiber;
        const relpath = files.pathRelative(files.getCurrentToolsDir(),
                                         frames[0].file);
        Console.rawError("  => " + failure.reason + " at " +
                         relpath + ":" + frames[0].line + "\n");
        if (failure.reason === 'no-match' || failure.reason === 'junk-before' ||
            failure.reason === 'match-timeout') {
          Console.arrowError("Pattern: " + failure.details.pattern, 2);
        }
        if (failure.reason === "wrong-exit-code") {
          const s = (status) => {
            return status.signal || ('' + status.code) || "???";
          };

          Console.rawError(
            "  => " + "Expected: " + s(failure.details.expected) +
              "; actual: " + s(failure.details.actual) + "\n");
        }
        if (failure.reason === 'expected-exception') {
        }
        if (failure.reason === 'not-equal') {
          Console.rawError(
            "  => " + "Expected: " + JSON.stringify(failure.details.expected) +
              "; actual: " + JSON.stringify(failure.details.actual) + "\n");
        }

        if (failure.details.run) {
          failure.details.run.outputLog.end();
          const lines = failure.details.run.outputLog.get();
          if (! lines.length) {
            Console.arrowError("No output", 2);
          } else {
            const historyLines = options.historyLines || 100;

            Console.arrowError("Last " + historyLines + " lines:", 2);
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
        Console.rawError("  => Test threw exception: " + failure.stack + "\n");
      }

      failedTests.push(test);
      testList.notifyFailed(test, failure);
    } else {
      Console.error(
        "... ok (" + test.durationMs + " ms)",
        Console.options({ indent: 2 }));
    }
  }

  testList.saveTestState();

  if (options.junit) {
    testList.saveJUnitOutput(options.junit);
  }

  if (totalRun > 0) {
    Console.error();
  }

  Console.error(testList.generateSkipReport());

  if (testList.filteredTests.length === 0) {
    Console.error("No tests run.");
    return 0;
  } else if (failedTests.length === 0) {
    let disclaimers = '';
    if (testList.filteredTests.length < testList.allTests.length) {
      disclaimers += " other";
    }
    Console.error("All" + disclaimers + " tests passed.");
    return 0;
  } else {
    const failureCount = failedTests.length;
    Console.error(failureCount + " failure" +
                  (failureCount > 1 ? "s" : "") + ":");
    failedTests.forEach((test) => {
      Console.rawError("  - " + test.file + ": " + test.name + "\n");
    });
    return 1;
  }
};

// To create self-tests:
//
// Create a new .js file in the tests directory. It will be picked
// up automatically.
//
// Start your file with something like:
//   var selftest = require('./selftest.js');
//   var Sandbox = selftest.Sandbox;
//
// Define tests with:
//   selftest.define("test-name", ['tag1', 'tag2'], function () {
//     ...
//   });
//
// The tags are used to group tests. Currently used tags:
//   - 'checkout': should only be run when we're running from a
//     checkout as opposed to a released copy.
//   - 'net': test requires an internet connection. Not going to work
//     if you're on a plane; will be skipped if we appear to be
//     offline unless run with 'self-test --force-online'.
//   - 'slow': test is slow enough that you don't want to run it
//     except on purpose. Won't run unless you say 'self-test --slow'.
//
// If you don't want to set any tags, you can omit that parameter
// entirely.
//
// Inside your test function, first create a Sandbox object, then call
// the run() method on the sandbox to set up a new run of meteor with
// arguments of your choice, and then use functions like match(),
// write(), and expectExit() to script that run.
