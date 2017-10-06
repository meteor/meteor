import { inspect } from 'util';
import { makeFulfillablePromise } from '../utils/fiber-helpers.js';
import { spawn, execFile } from 'child_process';
import * as files from '../fs/files.js';
import {
  randomPort,
  randomToken,
  sleepMs,
  timeoutScaleFactor,
} from '../utils/utils.js';
import {
  markBottom as parseStackMarkBottom,
  markTop as parseStackMarkTop,
  parse as parseStackParse,
} from '../utils/parse-stack.js';
import { Console } from '../console/console.js';
import { host as archInfoHost } from '../utils/archinfo.js';
import {
  getPackagesDirectoryName,
  getPackageStorage,
} from '../meteor-services/config.js';
import { capture, enterJob } from '../utils/buildmessage.js';
import { getUrlWithResuming } from '../utils/http-helpers.js';
import Builder from '../isobuild/builder.js';
import { DEFAULT_TRACK } from '../packaging/catalog/catalog.js';
import { RemoteCatalog } from '../packaging/catalog/catalog-remote.js';
import { IsopackCache } from '../isobuild/isopack-cache.js';
import { loadIsopackage } from '../tool-env/isopackets.js';
import { Tropohouse } from '../packaging/tropohouse.js';
import { PackageMap } from '../packaging/package-map.js';
import { current as releaseCurrent } from '../packaging/release.js';
import { FinishedUpgraders } from '../project-context.js';
import { allUpgraders } from '../upgraders.js';
import { execFileSync } from '../utils/processes.js';

function checkTestOnlyDependency(name) {
  try {
    var absPath = require.resolve(name);
  } catch (e) {
    throw new Error([
      "Please install " + name + " by running the following command:",
      "",
      "  /path/to/meteor npm install -g " + name,
      "",
      "Where `/path/to/meteor` is the executable you used to run this self-test.",
      ""
    ].join("\n"));
  }

  return require(absPath);
}

var phantomjs = checkTestOnlyDependency("phantomjs-prebuilt");
var webdriver = checkTestOnlyDependency('browserstack-webdriver');

const hasOwn = Object.prototype.hasOwnProperty;

import "../tool-env/install-runtime.js";

// To allow long stack traces that cross async boundaries
import 'longjohn';

// Exception representing a test failure
class TestFailure {
  constructor(reason, details) {
    this.reason = reason;
    this.details = details || {};
    this.stack = (new Error).stack;
  }
}

// Use this to decorate functions that throw TestFailure. Decorate the
// first function that should not be included in the call stack shown
// to the user.
export function markStack(f) {
  return parseStackMarkTop(f);
}

// Call from a test to throw a TestFailure exception and bail out of the test
export const fail = markStack(function (reason) {
  throw new TestFailure(reason);
});

// Call from a test to assert that 'actual' is equal to 'expected',
// with 'actual' being the value that the test got and 'expected'
// being the expected value
export const expectEqual = markStack(function (actual, expected) {
  if (! loadIsopackage('ejson').EJSON.equals(actual, expected)) {
    throw new TestFailure("not-equal", {
      expected: expected,
      actual: actual
    });
  }
});

// Call from a test to assert that 'actual' is truthy.
export const expectTrue = markStack(function (actual) {
  if (! actual) {
    throw new TestFailure('not-true');
  }
});

// Call from a test to assert that 'actual' is falsey.
export const expectFalse = markStack(function (actual) {
  if (actual) {
    throw new TestFailure('not-false');
  }
});

export const expectThrows = markStack(function (f) {
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

export function doOrThrow(f) {
  let ret;
  const messages = capture(function () {
    ret = f();
  });
  if (messages.hasMessages()) {
    throw Error(messages.formatMessages());
  }
  return ret;
}

// Our current strategy for running tests that need warehouses is to build all
// packages from the checkout into this temporary tropohouse directory, and for
// each test that need a fake warehouse, copy the built packages into the
// test-specific warehouse directory.  This isn't particularly fast, but it'll
// do for now. We build the packages during the first test that needs them.
let builtPackageTropohouseDir = null;
let tropohouseLocalCatalog = null;
let tropohouseIsopackCache = null;

// Let's build a minimal set of packages that's enough to get self-test
// working.  (And that doesn't need us to download any Atmosphere packages.)
const ROOT_PACKAGES_TO_BUILD_IN_SANDBOX = [
  // We need the tool in order to run from the fake warehouse at all.
  "meteor-tool",

  // We need the packages in the skeleton app in order to test 'meteor create'.
  'meteor-base',
  'mobile-experience',
  'mongo',
  'blaze-html-templates',
  'session',
  'jquery',
  'tracker',
  "autopublish",
  "insecure",
  "standard-minifier-css",
  "standard-minifier-js",
  "es5-shim",
  "shell-server"
];

function setUpBuiltPackageTropohouse() {
  if (builtPackageTropohouseDir) {
    return;
  }
  builtPackageTropohouseDir = files.mkdtemp('built-package-tropohouse');

  if (getPackagesDirectoryName() !== 'packages') {
    throw Error("running self-test with METEOR_PACKAGE_SERVER_URL set?");
  }

  const tropohouse = new Tropohouse(builtPackageTropohouseDir);
  tropohouseLocalCatalog = newSelfTestCatalog();
  const versions = {};
  tropohouseLocalCatalog.getAllNonTestPackageNames().forEach((packageName) => {
    versions[packageName] =
      tropohouseLocalCatalog.getLatestVersion(packageName).version;
  });
  const packageMap = new PackageMap(versions, {
    localCatalog: tropohouseLocalCatalog
  });
  // Make an isopack cache that doesn't automatically save isopacks to disk and
  // has no access to versioned packages.
  tropohouseIsopackCache = new IsopackCache({
    packageMap: packageMap,
    includeCordovaUnibuild: true
  });
  doOrThrow(function () {
    enterJob("building self-test packages", () => {
      // Build the packages into the in-memory IsopackCache.
      tropohouseIsopackCache.buildLocalPackages(
        ROOT_PACKAGES_TO_BUILD_IN_SANDBOX);
    });
  });

  // Save all the isopacks into builtPackageTropohouseDir/packages.  (Note that
  // we are always putting them into the default 'packages' (assuming
  // $METEOR_PACKAGE_SERVER_URL is not set in the self-test process itself) even
  // though some tests will want them to be under
  // 'packages-for-server/test-packages'; we'll fix this in _makeWarehouse.
  tropohouseIsopackCache.eachBuiltIsopack((name, isopack) => {
    tropohouse._saveIsopack(isopack, name);
  });
};

function newSelfTestCatalog() {
  if (! files.inCheckout()) {
    throw Error("Only can build packages from a checkout");
  }

  const catalogLocal = require('../packaging/catalog/catalog-local.js');
  const selfTestCatalog = new catalogLocal.LocalCatalog;
  const messages = capture(
    { title: "scanning local core packages" },
    () => {
      const packagesDir =
        files.pathJoin(files.getCurrentToolsDir(), 'packages');

      // When building a fake warehouse from a checkout, we use local packages,
      // but *ONLY THOSE FROM THE CHECKOUT*: not app packages or $PACKAGE_DIRS
      // packages.  One side effect of this: we really really expect them to all
      // build, and we're fine with dying if they don't (there's no worries
      // about needing to springboard).
      selfTestCatalog.initialize({
        localPackageSearchDirs: [
          packagesDir,
          files.pathJoin(packagesDir, "non-core", "*", "packages"),
        ],
      });
    });
  if (messages.hasMessages()) {
    Console.arrowError("Errors while scanning core packages:");
    Console.printMessages(messages);
    throw new Error("scan failed?");
  }
  return selfTestCatalog;
}


///////////////////////////////////////////////////////////////////////////////
// Matcher
///////////////////////////////////////////////////////////////////////////////

// Handles the job of waiting until text is seen that matches a
// regular expression.

class Matcher {
  constructor(run) {
    this.buf = "";
    this.fullBuffer = "";
    this.ended = false;
    this.resetMatch();
    this.run = run; // used only to set a field on exceptions
    this.endPromise = new Promise(resolve => {
      this.resolveEndPromise = resolve;
    });
  }

  write(data) {
    this.buf += data;
    this.fullBuffer += data;
    this._tryMatch();
  }

  resetMatch() {
    const mp = this.matchPromise;

    this.matchPattern = null;
    this.matchPromise = null;
    this.matchStrict = null;
    this.matchFullBuffer = false;

    return mp;
  }

  rejectMatch(error) {
    const mp = this.resetMatch();
    if (mp) {
      mp.reject(error);
    } else {
      // If this.matchPromise was not defined, we should not swallow this
      // error, so we must throw it instead.
      throw error;
    }
  }

  resolveMatch(value) {
    const mp = this.resetMatch();
    if (mp) {
      mp.resolve(value);
    }
  }

  match(pattern, timeout, strict) {
    return this.matchAsync(pattern, { timeout, strict }).await();
  }

  // Like match, but returns a Promise without calling .await().
  matchAsync(pattern, {
    timeout = null,
    strict = false,
    matchFullBuffer = false,
  }) {
    if (this.matchPromise) {
      return Promise.reject(new Error("already have a match pending?"));
    }
    this.matchPattern = pattern;
    this.matchStrict = strict;
    this.matchFullBuffer = matchFullBuffer;
    const mp = this.matchPromise = makeFulfillablePromise();
    this._tryMatch(); // could clear this.matchPromise

    let timer = null;
    if (timeout) {
      timer = setTimeout(() => {
        this.rejectMatch(new TestFailure('match-timeout', {
          run: this.run,
          pattern: this.matchPattern
        }));
      }, timeout * 1000);
    } else {
      return mp;
    }

    return mp.then(result => {
      clearTimeout(timer);
      return result;
    }, error => {
      clearTimeout(timer);
      throw error;
    });
  }

  matchBeforeEnd(pattern, timeout) {
    return this._beforeEnd(() => this.matchAsync(pattern, {
      timeout: timeout || 15,
      matchFullBuffer: true,
    }));
  }

  _beforeEnd(promiseCallback) {
    return this.endPromise = this.endPromise.then(promiseCallback);
  }

  end() {
    return this.endAsync().await();
  }

  endAsync() {
    this.resolveEndPromise();
    return this._beforeEnd(() => {
      this.ended = true;
      this._tryMatch();
      return this.matchPromise;
    });
  }

  matchEmpty() {
    if (this.buf.length > 0) {
      Console.info("Extra junk is :", this.buf);
      throw new TestFailure('junk-at-end', { run: this.run });
    }
  }

  _tryMatch() {
    const mp = this.matchPromise;
    if (! mp) {
      return;
    }

    let ret = null;

    if (this.matchFullBuffer) {
      // Note: this.matchStrict is ignored if this.matchFullBuffer truthy.
      if (this.matchPattern instanceof RegExp) {
        ret = this.fullBuffer.match(this.matchPattern);
      } else if (this.fullBuffer.indexOf(this.matchPattern) >= 0) {
        ret = this.matchPattern;
      }

    } else if (this.matchPattern instanceof RegExp) {
      const m = this.buf.match(this.matchPattern);
      if (m) {
        if (this.matchStrict && m.index !== 0) {
          Console.info("Extra junk is: ", this.buf.substr(0, m.index));
          return this.rejectMatch(new TestFailure('junk-before', {
            run: this.run,
            pattern: this.matchPattern
          }));
        }
        ret = m;
        this.buf = this.buf.slice(m.index + m[0].length);
      }

    } else {
      const i = this.buf.indexOf(this.matchPattern);
      if (i !== -1) {
        if (this.matchStrict && i !== 0) {
          Console.info("Extra junk is: ", this.buf.substr(0, i));
          return this.rejectMatch(new TestFailure('junk-before', {
            run: this.run,
            pattern: this.matchPattern
          }));
        }
        ret = this.matchPattern;
        this.buf = this.buf.slice(i + this.matchPattern.length);
      }
    }

    if (ret !== null) {
      return this.resolveMatch(ret);
    }

    if (this.ended) {
      return this.rejectMatch(new TestFailure('no-match', {
        run: this.run,
        pattern: this.matchPattern
      }));
    }
  }
}

///////////////////////////////////////////////////////////////////////////////
// OutputLog
///////////////////////////////////////////////////////////////////////////////

// Maintains a line-by-line merged log of multiple output channels
// (eg, stdout and stderr).

class OutputLog {
  constructor(run) {
    // each entry is an object with keys 'channel', 'text', and if it is
    // the last entry and there was no newline terminator, 'bare'
    this.lines = [];

    // map from a channel name to an object representing a partially
    // read line of text on that channel. That object has keys 'text'
    // (text read), 'offset' (cursor position, equal to text.length
    // unless a '\r' has been read).
    this.buffers = {};

    // a Run, exclusively for inclusion in exceptions
    this.run = run;
  }

  write(channel, text) {
    if (! hasOwn.call(this.buffers, 'channel')) {
      this.buffers[channel] = { text: '', offset: 0};
    }
    const b = this.buffers[channel];

    while (text.length) {
      const m = text.match(/^[^\n\r]+/);
      if (m) {
        // A run of non-control characters.
        b.text = b.text.substr(0, b.offset) +
          m[0] + b.text.substr(b.offset + m[0].length);
        b.offset += m[0].length;
        text = text.substr(m[0].length);
        continue;
      }

      if (text[0] === '\r') {
        b.offset = 0;
        text = text.substr(1);
        continue;
      }

      if (text[0] === '\n') {
        this.lines.push({ channel: channel, text: b.text });
        b.text = '';
        b.offset = 0;
        text = text.substr(1);
        continue;
      }

      throw new Error("conditions should have been exhaustive?");
    }
  }

  end() {
    Object.keys(this.buffers).forEach((channel) => {
      if (this.buffers[channel].text.length) {
        this.lines.push({ channel: channel,
                          text: this.buffers[channel].text,
                          bare: true });
        this.buffers[channel] = { text: '', offset: 0};
      }
    });
  }

  forbid(pattern, channel) {
    this.lines.forEach((line) => {
      if (channel && channel !== line.channel) {
        return;
      }

      const match = (pattern instanceof RegExp) ?
        (line.text.match(pattern)) : (line.text.indexOf(pattern) !== -1);
      if (match) {
        throw new TestFailure('forbidden-string-present', { run: this.run });
      }
    });
  }

  get() {
    return this.lines;
  }
}


///////////////////////////////////////////////////////////////////////////////
// Sandbox
///////////////////////////////////////////////////////////////////////////////

// Represents an install of the tool. Creating this creates a private
// sandbox with its own state, separate from the state of the current
// meteor install or checkout, from the user's homedir, and from the
// state of any other sandbox. It also creates an empty directory
// which will be, by default, the cwd for runs created inside the
// sandbox (you can change this with the cd() method).
//
// This will throw TestFailure if it has to build packages to set up
// the sandbox and the build fails. So, only call it from inside
// tests.
//
// options:
// - warehouse: set to sandbox the warehouse too. If you don't do
//   this, the tests are run in the same context (checkout or
//   warehouse) as the actual copy of meteor you're running (the
//   meteor in 'meteor self-test'. This may only be set when you're
//   running 'meteor self-test' from a checkout. If it is set, it
//   should look something like this:
//   {
//     version1: { tools: 'tools1', notices: (...) },
//     version2: { tools: 'tools2', upgraders: ["a"],
//     notices: (...), latest: true }
//   }
//   This would set up a simulated warehouse with two releases in it,
//   one called 'version1' and having a tools version of 'tools1', and
//   similarly with 'version2'/'tools2', with the latter being marked
//   as the latest release, and the latter also having a single
//   upgrader named "a". The releases are made by building the
//   checkout into a release, and are identical except for their
//   version names. If you pass 'notices' (which is optional), set it
//   to the verbatim contents of the notices.json file for the
//   release, as an object.
// - fakeMongo: if set, set an environment variable that causes our
//   'fake-mongod' stub process to be started instead of 'mongod'. The
//   tellMongo method then becomes available on Runs for controlling
//   the stub.
// - clients
//   - browserstack: true if browserstack clients should be used
//   - port: the port that the clients should run on

export class Sandbox {
  constructor(options) {
    // default options
    options = Object.assign({ clients: {} }, options);

    this.root = files.mkdtemp();
    this.warehouse = null;

    this.home = files.pathJoin(this.root, 'home');
    files.mkdir(this.home, 0o755);
    this.cwd = this.home;
    this.env = {};
    this.fakeMongo = options.fakeMongo;

    if (hasOwn.call(options, 'warehouse')) {
      if (!files.inCheckout()) {
        throw Error("make only use a fake warehouse in a checkout");
      }
      this.warehouse = files.pathJoin(this.root, 'tropohouse');
      this._makeWarehouse(options.warehouse);
    }

    this.clients = [new PhantomClient({
      host: 'localhost',
      port: options.clients.port || 3000
    })];

    if (options.clients && options.clients.browserstack) {
      const browsers = [
        { browserName: 'firefox' },
        { browserName: 'chrome' },
        { browserName: 'internet explorer',
          browserVersion: '11' },
        { browserName: 'internet explorer',
          browserVersion: '8',
          timeout: 60 },
        { browserName: 'safari' },
        { browserName: 'android' }
      ];

      Object.keys(browsers).forEach(browserKey => {
        const browser = browsers[browserKey];
        this.clients.push(new BrowserStackClient({
          host: 'localhost',
          port: 3000,
          browserName: browser.browserName,
          browserVersion: browser.browserVersion,
          timeout: browser.timeout
        }));
      });
    }

    const meteorScript = process.platform === "win32" ? "meteor.bat" : "meteor";

    // Figure out the 'meteor' to run
    if (this.warehouse) {
      this.execPath = files.pathJoin(this.warehouse, meteorScript);
    } else {
      this.execPath = files.pathJoin(files.getCurrentToolsDir(), meteorScript);
    }
  }

  // Create a new test run of the tool in this sandbox.
  run(...args) {
    return new Run(this.execPath, {
      sandbox: this,
      args: args,
      cwd: this.cwd,
      env: this._makeEnv(),
      fakeMongo: this.fakeMongo
    });
  }

  // Tests a set of clients with the argument function. Each call to f(run)
  // instantiates a Run with a different client.
  // Use:
  // sandbox.testWithAllClients(function (run) {
  //   // pre-connection checks
  //   run.connectClient();
  //   // post-connection checks
  // });
  testWithAllClients(f, ...args) {
    args = args.filter(arg => arg);

    console.log("running test with " + this.clients.length + " client(s).");

    Object.keys(this.clients).forEach((clientKey) => {
      const client = this.clients[clientKey];
      console.log("testing with " + client.name + "...");
      const run = new Run(this.execPath, {
        sandbox: this,
        args: args,
        cwd: this.cwd,
        env: this._makeEnv(),
        fakeMongo: this.fakeMongo,
        client: client
      });
      run.baseTimeout = client.timeout;
      f(run);
    });
  }

  // Copy an app from a template into the current directory in the
  // sandbox. 'to' is the subdirectory to put the app in, and
  // 'template' is a subdirectory of tools/tests/apps to copy.
  //
  // Note that the arguments are the opposite order from 'cp'. That
  // seems more intuitive to me -- if you disagree, my apologies.
  //
  // For example:
  //   s.createApp('myapp', 'empty');
  //   s.cd('myapp');
  createApp(to, template, options) {
    options = options || {};
    const absoluteTo = files.pathJoin(this.cwd, to);
    files.cp_r(files.pathJoin(
      files.convertToStandardPath(__dirname), '..', 'tests', 'apps', template),
        absoluteTo, { ignore: [/^local$/] });
    // If the test isn't explicitly managing a mock warehouse, ensure that apps
    // run with our release by default.
    if (options.release) {
      this.write(files.pathJoin(to, '.meteor/release'), options.release);
    } else if (!this.warehouse && releaseCurrent.isProperRelease()) {
      this.write(files.pathJoin(to, '.meteor/release'), releaseCurrent.name);
    }

    // Make sure the apps don't run any upgraders, unless they intentionally
    // have a partial upgraders file
    const upgradersFile =
      new FinishedUpgraders({projectDir: absoluteTo});
    if (upgradersFile.readUpgraders().length === 0) {
      upgradersFile.appendUpgraders(allUpgraders());
    }

    require("../cli/default-npm-deps.js").install(absoluteTo);

    if (options.dontPrepareApp) {
      return;
    }

    // Prepare the app (ie, build or download packages). We give this a nice
    // long timeout, which allows the next command to not need a bloated
    // timeout. (meteor create does this anyway.)
    this.cd(to, () => {
      const run = this.run("--prepare-app");
      // XXX Can we cache the output of running this once somewhere, so that
      // multiple calls to createApp with the same template get the same cache?
      // This is a little tricky because isopack-buildinfo.json uses absolute
      // paths.
      run.waitSecs(120);
      run.expectExit(0);
    });
  }

  // Same as createApp, but with a package.
  //
  // @param packageDir  {String} The directory in which to create the package
  // @param packageName {String} The package name to create. This string will
  //                             replace all appearances of ~package-name~
  //                             in any package*.js files in the template
  // @param template    {String} The package template to use. Found as a
  //                             subdirectory in tests/packages/
  //
  // For example:
  //   s.createPackage('me_mypack', me:mypack', 'empty');
  //   s.cd('me_mypack');
  createPackage(packageDir, packageName, template) {
    const packagePath = files.pathJoin(this.cwd, packageDir);
    const templatePackagePath = files.pathJoin(
      files.convertToStandardPath(__dirname), '..', 'tests', 'packages', template);
    files.cp_r(templatePackagePath, packagePath);

    files.readdir(packagePath).forEach((file) => {
      if (file.match(/^package.*\.js$/)) {
        const packageJsFile = files.pathJoin(packagePath, file);
        files.writeFile(
          packageJsFile,
          files.readFile(packageJsFile, "utf8")
            .replace("~package-name~", packageName));
      }
    });
  }

  // Change the cwd to be used for subsequent runs. For example:
  //   s.run('create', 'myapp').expectExit(0);
  //   s.cd('myapp');
  //   s.run('add', 'somepackage') ...
  // If you provide a callback, it will invoke the callback and then
  // change the cwd back to the previous value.  eg:
  //   s.cd('app1', function () {
  //     s.run('add', 'somepackage');
  //   });
  //   s.cd('app2', function () {
  //     s.run('add', 'somepackage');
  //   });
  cd(relativePath, callback) {
    const previous = this.cwd;
    this.cwd = files.pathResolve(this.cwd, relativePath);
    if (callback) {
      callback();
      this.cwd = previous;
    }
  }

  // Set an environment variable for subsequent runs.
  set(name, value) {
    this.env[name] = value;
  }

  // Undo set().
  unset(name) {
    delete this.env[name];
  }

  // Write to a file in the sandbox, overwriting its current contents
  // if any. 'filename' is a path intepreted relative to the Sandbox's
  // cwd. 'contents' is a string (utf8 is assumed).
  write(filename, contents) {
    files.writeFile(files.pathJoin(this.cwd, filename), contents, 'utf8');
  }

  // Like writeFile, but appends rather than writes.
  append(filename, contents) {
    files.appendFile(files.pathJoin(this.cwd, filename), contents, 'utf8');
  }

  // Reads a file in the sandbox as a utf8 string. 'filename' is a
  // path intepreted relative to the Sandbox's cwd.  Returns null if
  // file does not exist.
  read(filename) {
    const file = files.pathJoin(this.cwd, filename);
    if (!files.exists(file)) {
      return null;
    } else {
      return files.readFile(files.pathJoin(this.cwd, filename), 'utf8');
    }
  }

  // Copy the contents of one file to another.  In these series of tests, we often
  // want to switch contents of package.js files. It is more legible to copy in
  // the backup file rather than trying to write into it manually.
  cp(from, to) {
    const contents = this.read(from);
    if (!contents) {
      throw new Error("File " + from + " does not exist.");
    };
    this.write(to, contents);
  }

  // Delete a file in the sandbox. 'filename' is as in write().
  unlink(filename) {
    files.unlink(files.pathJoin(this.cwd, filename));
  }

  // Make a directory in the sandbox. 'filename' is as in write().
  mkdir(dirname) {
    const dirPath = files.pathJoin(this.cwd, dirname);
    if (! files.exists(dirPath)) {
      files.mkdir(dirPath);
    }
  }

  // Rename something in the sandbox. 'oldName' and 'newName' are as in write().
  rename(oldName, newName) {
    files.rename(files.pathJoin(this.cwd, oldName),
                 files.pathJoin(this.cwd, newName));
  }

  // Return the current contents of .meteorsession in the sandbox.
  readSessionFile() {
    return files.readFile(files.pathJoin(this.root, '.meteorsession'), 'utf8');
  }

  // Overwrite .meteorsession in the sandbox with 'contents'. You
  // could use this in conjunction with readSessionFile to save and
  // restore authentication states.
  writeSessionFile(contents) {
    return files.writeFile(files.pathJoin(this.root, '.meteorsession'),
                           contents, 'utf8');
  }

  _makeEnv() {
    const env = Object.assign(Object.create(null), this.env);
    env.METEOR_SESSION_FILE = files.convertToOSPath(
      files.pathJoin(this.root, '.meteorsession'));

    if (this.warehouse) {
      // Tell it where the warehouse lives.
      env.METEOR_WAREHOUSE_DIR = files.convertToOSPath(this.warehouse);

      // Don't ever try to refresh the stub catalog we made.
      env.METEOR_OFFLINE_CATALOG = "t";
    }

    // By default (ie, with no mock warehouse and no --release arg) we should be
    // testing the actual release this is built in, so we pretend that it is the
    // latest release.
    if (!this.warehouse && releaseCurrent.isProperRelease()) {
      env.METEOR_TEST_LATEST_RELEASE = releaseCurrent.name;
    }

    // Allow user to set TOOL_NODE_FLAGS for self-test app.
    if (process.env.TOOL_NODE_FLAGS && ! process.env.SELF_TEST_TOOL_NODE_FLAGS)
      console.log('Consider setting SELF_TEST_TOOL_NODE_FLAGS to configure ' +
                  'self-test test applicaion spawns');
    env.TOOL_NODE_FLAGS = process.env.SELF_TEST_TOOL_NODE_FLAGS || '';

    return env;
  }

  // Writes a stub warehouse (really a tropohouse) to the directory
  // this.warehouse. This warehouse only contains a meteor-tool package and some
  // releases containing that tool only (and no packages).
  //
  // packageServerUrl indicates which package server we think we are using. Use
  // the default, if we do not pass this in; you should pass it in any case that
  // you will be specifying $METEOR_PACKAGE_SERVER_URL in the environment of a
  // command you are running in this sandbox.
  _makeWarehouse(releases) {
    // Ensure we have a tropohouse to copy stuff out of.
    setUpBuiltPackageTropohouse();

    const serverUrl = this.env.METEOR_PACKAGE_SERVER_URL;
    const packagesDirectoryName = getPackagesDirectoryName(serverUrl);

    const builder = new Builder({outputPath: this.warehouse});
    builder.copyDirectory({
      from: files.pathJoin(builtPackageTropohouseDir, 'packages'),
      to: packagesDirectoryName,
      symlink: true
    });
    builder.complete();

    const stubCatalog = {
      syncToken: {},
      formatVersion: "1.0",
      collections: {
        packages: [],
        versions: [],
        builds: [],
        releaseTracks: [],
        releaseVersions: []
      }
    };

    const packageVersions = {};
    let toolPackageVersion = null;

    tropohouseIsopackCache.eachBuiltIsopack((packageName, isopack) => {
      const packageRec = tropohouseLocalCatalog.getPackage(packageName);
      if (! packageRec) {
        throw Error("no package record for " + packageName);
      }
      stubCatalog.collections.packages.push(packageRec);

      const versionRec = tropohouseLocalCatalog.getLatestVersion(packageName);
      if (! versionRec) {
        throw Error("no version record for " + packageName);
      }
      stubCatalog.collections.versions.push(versionRec);

      stubCatalog.collections.builds.push({
        buildArchitectures: isopack.buildArchitectures(),
        versionId: versionRec._id,
        _id: randomToken()
      });

      if (packageName === "meteor-tool") {
        toolPackageVersion = versionRec.version;
      } else {
        packageVersions[packageName] = versionRec.version;
      }
    });

    if (! toolPackageVersion) {
      throw Error("no meteor-tool?");
    }

    stubCatalog.collections.releaseTracks.push({
      name: DEFAULT_TRACK,
      _id: randomToken()
    });

    // Now create each requested release.
    Object.keys(releases).forEach((releaseName) => {
      const configuration = releases[releaseName];
      // Release info
      stubCatalog.collections.releaseVersions.push({
        track: DEFAULT_TRACK,
        _id: Math.random().toString(),
        version: releaseName,
        orderKey: releaseName,
        description: "test release " + releaseName,
        recommended: !!configuration.recommended,
        tool: configuration.tool || "meteor-tool@" + toolPackageVersion,
        packages: packageVersions
      });
    });

    const dataFile = getPackageStorage({
      root: this.warehouse,
      serverUrl: serverUrl
    });
    this.warehouseOfficialCatalog = new RemoteCatalog();
    this.warehouseOfficialCatalog.initialize({
      packageStorage: dataFile
    });
    this.warehouseOfficialCatalog.insertData(stubCatalog);

    // And a cherry on top
    // XXX this is hacky
    files.linkToMeteorScript(
      files.pathJoin(this.warehouse, packagesDirectoryName, "meteor-tool", toolPackageVersion,
        'mt-' + archInfoHost(), 'meteor'),
      files.pathJoin(this.warehouse, 'meteor'));
  }
}

///////////////////////////////////////////////////////////////////////////////
// Client
///////////////////////////////////////////////////////////////////////////////

class Client {
  constructor(options) {
    this.host = options.host;
    this.port = options.port;
    this.url = "http://" + this.host + ":" + this.port + '/' +
      (Math.random() * 0x100000000 + 1).toString(36);
    this.timeout = options.timeout || 40;

    if (! this.connect || ! this.stop) {
      console.log("Missing methods in subclass of Client.");
    }
  }
}

// PhantomClient
class PhantomClient extends Client {
  constructor(options) {
    super(options);

    this.name = "phantomjs";
    this.process = null;

    this._logError = true;
  }

  connect() {
    const phantomPath = phantomjs.path;

    const scriptPath = files.pathJoin(files.getCurrentToolsDir(), "tools",
      "tool-testing", "phantom", "open-url.js");
    this.process = execFile(phantomPath, ["--load-images=no",
      files.convertToOSPath(scriptPath), this.url],
      {}, (error, stdout, stderr) => {
        if (this._logError && error) {
          console.log(
            "PhantomJS exited with error ", error,
            "\nstdout:\n", stdout,
            "\nstderr:\n", stderr
          );
        } else if (stderr) {
          console.log("PhantomJS stderr:\n", stderr);
        }
      });
  }

  stop() {
    // Suppress the expected SIGTERM exit 'failure'
    this._logError = false;
    this.process && this.process.kill();
    this.process = null;
  }
}

// BrowserStackClient
let browserStackKey = null;

class BrowserStackClient extends Client {
  constructor(options) {
    super(options);

    this.tunnelProcess = null;
    this.driver = null;

    this.browserName = options.browserName;
    this.browserVersion = options.browserVersion;

    this.name = "BrowserStack - " + this.browserName;
    if (this.browserVersion) {
      this.name += " " + this.browserVersion;
    }
  }

  connect() {
    // memoize the key
    if (browserStackKey === null) {
      browserStackKey = this._getBrowserStackKey();
    }
    if (! browserStackKey) {
      throw new Error("BrowserStack key not found. Ensure that you " +
        "have installed your S3 credentials.");
    }

    const capabilities = {
      'browserName' : this.browserName,
      'browserstack.user' : 'meteor',
      'browserstack.local' : 'true',
      'browserstack.key' : browserStackKey
    };

    if (this.browserVersion) {
      capabilities.browserVersion = this.browserVersion;
    }

    this._launchBrowserStackTunnel((error) => {
      if (error) {
        throw error;
      }

      this.driver = new webdriver.Builder().
        usingServer('http://hub.browserstack.com/wd/hub').
        withCapabilities(capabilities).
        build();
      this.driver.get(this.url);
    });
  }

  stop() {
    this.tunnelProcess && this.tunnelProcess.kill();
    this.tunnelProcess = null;

    this.driver && this.driver.quit();
    this.driver = null;
  }

  _getBrowserStackKey() {
    const outputDir = files.pathJoin(files.mkdtemp(), "key");

    try {
      execFileSync("s3cmd", ["get",
        "s3://meteor-browserstack-keys/browserstack-key",
        outputDir
      ]);

      return files.readFile(outputDir, "utf8").trim();
    } catch (e) {
      return null;
    }
  }

  _launchBrowserStackTunnel(callback) {
    const browserStackPath = ensureBrowserStack();

    const args = [
      browserStackPath,
      browserStackKey,
      [this.host, this.port, 0].join(','),
      // Disable Live Testing and Screenshots, just test with Automate.
      '-onlyAutomate',
      // Do not wait for the server to be ready to spawn the process.
      '-skipCheck'
    ];
    this.tunnelProcess = execFile(
      '/usr/bin/env',
      ['bash', '-c', args.join(' ')]
    );

    // Called when the SSH tunnel is established.
    this.tunnelProcess.stdout.on('data', (data) => {
      if (data.toString().match(/You can now access your local server/)) {
        callback();
      }
    });
  }
}

function ensureBrowserStack() {
  const browserStackPath = files.pathJoin(
    files.getDevBundle(),
    'bin',
    'BrowserStackLocal'
  );

  const browserStackStat = files.statOrNull(browserStackPath);
  if (! browserStackStat) {
    const host = "browserstack-binaries.s3.amazonaws.com";
    const OS = process.platform === "darwin" ? "osx" : "linux";
    const ARCH = process.arch === "x64" ? "x86_64" : "i686";
    const tarGz = `BrowserStackLocal-07-03-14-${OS}-${ARCH}.gz`;
    const url = `https:\/\/${host}/${tarGz}`;

    enterJob("downloading BrowserStack binaries", () => {
      return new Promise((resolve, reject) => {
        const browserStackStream =
          files.createWriteStream(browserStackPath);

        browserStackStream.on("error", reject);
        browserStackStream.on("end", resolve);

        const gunzip = require("zlib").createGunzip();
        gunzip.pipe(browserStackStream);
        gunzip.write(getUrlWithResuming(url));
        gunzip.end();
      }).await();
    });
  }

  files.chmod(browserStackPath, 0o755);

  return browserStackPath;
}

///////////////////////////////////////////////////////////////////////////////
// Run
///////////////////////////////////////////////////////////////////////////////

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
export class Run {
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
        this._args.push('' + a);
      } else {
        Object.keys(a).forEach((key) => {
          const value = a[key];
          this._args.push("--" + key);
          this._args.push('' + value);
        });
      }
    });

  }

  connectClient() {
    if (! this.client) {
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

    this.client && this.client.stop();

    this.exitStatus = status;
    const exitPromiseResolvers = this.exitPromiseResolvers;
    this.exitPromiseResolvers = null;
    exitPromiseResolvers.forEach((resolve) => {
      resolve();
    });

    this._endMatchers();
  }

  _endMatchers() {
    return this.matcherEndPromise =
      this.matcherEndPromise || Promise.all([
        this.stdoutMatcher.endAsync(),
        this.stderrMatcher.endAsync()
      ]);
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
        env: env
      });

    this.proc.on('close', (code, signal) => {
      if (this.exitStatus === undefined) {
        this._exited({ code: code, signal: signal });
      }
    });

    this.proc.on('exit', (code, signal) => {
      if (this.exitStatus === undefined) {
        this._exited({ code: code, signal: signal });
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
    return this.stdoutMatcher.match(pattern, timeout, _strict);
  }

  // As expect(), but for stderr instead of stdout.
  matchErr(pattern, _strict) {
    this._ensureStarted();

    let timeout = this.baseTimeout + this.extraTime;
    timeout *= timeoutScaleFactor;
    this.extraTime = 0;
    return this.stderrMatcher.match(pattern, timeout, _strict);
  }

  // Like match(), but won't skip ahead looking for a match. It must
  // follow immediately after the last thing we matched or read.
  read(pattern) {
    return this.match(pattern, true);
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
  // run.expectExit(1);  // <<-- improtant to actually run the command
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
  expectEnd() {
    this._ensureStarted();

    let timeout = this.baseTimeout + this.extraTime;
    timeout *= timeoutScaleFactor;
    this.extraTime = 0;
    this.expectExit();

    this.stdoutMatcher.matchEmpty();
    this.stderrMatcher.matchEmpty();
  }

  // Expect the program to exit with the given (numeric) exit
  // status. Fail if the process exits with a different code, or if
  // the process does not exit after a timeout. You can also omit the
  // argument to simply wait for the program to exit.
  expectExit(code) {
    this._ensureStarted();

    this._endMatchers().await();

    if (this.exitStatus === undefined) {
      let timeout = this.baseTimeout + this.extraTime;
      timeout *= timeoutScaleFactor;
      this.extraTime = 0;

      var timer;
      const promise = new Promise((resolve, reject) => {
        this.exitPromiseResolvers.push(resolve);
        timer = setTimeout(() => {
          this.exitPromiseResolvers =
            this.exitPromiseResolvers.filter(r => r !== resolve);
          reject(new TestFailure('exit-timeout', { run: this }));
        }, timeout * 1000);
      });

      try {
        promise.await();
      } finally {
        clearTimeout(timer);
      }
    }

    if (! this.exitStatus) {
      throw new TestFailure('spawn-failure', { run: this });
    }
    if (code !== undefined && this.exitStatus.code !== code) {
      throw new TestFailure('wrong-exit-code', {
        expected: { code: code },
        actual: this.exitStatus,
        run: this
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
  stop() {
    if (this.exitStatus === undefined) {
      this._ensureStarted();
      this.client && this.client.stop();
      this._killProcess();
      this.expectExit();
    }
  }

  // Like stop, but doesn't wait for it to exit.
  _stopWithoutWaiting() {
    if (this.exitStatus === undefined && this.proc) {
      this.client && this.client.stop();
      this._killProcess();
    }
  }

  // Kills the running process and it's child processes
  _killProcess() {
    if (!this.proc) {
      throw new Error("Unexpected: `this.proc` undefined when calling _killProcess");
    }

    if (process.platform === "win32") {
      // looks like in Windows `this.proc.kill()` doesn't kill child
      // processes.
      execFileSync("taskkill", ["/pid", this.proc.pid, '/f', '/t']);
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
  tellMongo(command) {
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
      for (let attempts = 0; ! this.fakeMongoConnection && attempts < 600;
           attempts ++) {
        // Throttle attempts to one every 100ms
        sleepMs((lastStartTime + 100) - (+ new Date));
        lastStartTime = +(new Date);

        new Promise((resolve) => {
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
        }).await();
      }

      if (! this.fakeMongoConnection) {
        throw new TestFailure("mongo-not-running", { run: this });
      }
    }

    this.fakeMongoConnection.write(JSON.stringify(command) + "\n");
    // If we told it to exit, then we should close our end and connect again if
    // asked to send more.
    if (command.exit) {
      this.fakeMongoConnection.end();
      this.fakeMongoConnection = null;
    }
  }
}

const wrapWithMarkStack = (func) => markStack(func);

// `Run` class methods to wrap with `markStack`
[
  'expectEnd',
  'expectExit',
  'forbid',
  'forbidAll',
  'forbidErr',
  'match',
  'matchBeforeExit',
  'matchErr',
  'matchErrBeforeExit',
  'read',
  'readErr',
  'stop',
  'tellMongo',
].forEach(functionName =>
  Run.prototype[functionName] = wrapWithMarkStack(Run.prototype[functionName]));

///////////////////////////////////////////////////////////////////////////////
// Defining tests
///////////////////////////////////////////////////////////////////////////////

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
let runningTest = null;
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
      fileBeingLoadedHash =
        require('crypto').createHash('sha1').update(contents).digest('hex');

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
    name: name,
    tags: tags,
    file: fileBeingLoaded,
    fileHash: fileBeingLoadedHash,
    func: f
  }));
};

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
  'custom-warehouse': "requires a custom warehouse"
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
  tests.forEach(test => {
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
      runningTest = test;
      startTime = +(new Date);
      // ensure we mark the bottom of the stack each time we start a new test
      parseStackMarkBottom(() => {
        test.f(options);
      })();
    } catch (e) {
      failure = e;
    } finally {
      runningTest = null;
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
