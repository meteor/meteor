var _ = require('underscore');
var util = require('util');
var Future = require('fibers/future');
var child_process = require('child_process');
var phantomjs = require('phantomjs');
var webdriver = require('browserstack-webdriver');

var files = require('../fs/files.js');
var utils = require('../utils/utils.js');
var parseStack = require('../utils/parse-stack.js');
var Console = require('../console/console.js').Console;
var archinfo = require('../utils/archinfo.js');
var config = require('../meteor-services/config.js');
var buildmessage = require('../utils/buildmessage.js');

var catalog = require('../packaging/catalog/catalog.js');
var catalogRemote = require('../packaging/catalog/catalog-remote.js');
var isopackCacheModule = require('../isobuild/isopack-cache.js');
var isopackets = require('../tool-env/isopackets.js');

var tropohouseModule = require('../packaging/tropohouse.js');
var packageMapModule = require('../packaging/package-map.js');
var release = require('../packaging/release.js');

var projectContextModule = require('../project-context.js');
var upgraders = require('../upgraders.js');

// Exception representing a test failure
var TestFailure = function (reason, details) {
  var self = this;
  self.reason = reason;
  self.details = details || {};
  self.stack = (new Error).stack;
};

// Use this to decorate functions that throw TestFailure. Decorate the
// first function that should not be included in the call stack shown
// to the user.
var markStack = function (f) {
  return parseStack.markTop(f);
};

// Call from a test to throw a TestFailure exception and bail out of the test
var fail = markStack(function (reason) {
  throw new TestFailure(reason);
});

// Call from a test to assert that 'actual' is equal to 'expected',
// with 'actual' being the value that the test got and 'expected'
// being the expected value
var expectEqual = markStack(function (actual, expected) {
  var Package = isopackets.load('ejson');
  if (! Package.ejson.EJSON.equals(actual, expected)) {
    throw new TestFailure("not-equal", {
      expected: expected,
      actual: actual
    });
  }
});

// Call from a test to assert that 'actual' is truthy.
var expectTrue = markStack(function (actual) {
  if (! actual) {
    throw new TestFailure('not-true');
  }
});
// Call from a test to assert that 'actual' is falsey.
var expectFalse = markStack(function (actual) {
  if (actual) {
    throw new TestFailure('not-false');
  }
});

var expectThrows = markStack(function (f) {
  var threw = false;
  try {
    f();
  } catch (e) {
    threw = true;
  }

  if (! threw)
    throw new TestFailure("expected-exception");
});

// Execute a command synchronously, discarding stderr.
var execFileSync = function (binary, args, opts) {
  return Future.wrap(function(cb) {
    var cb2 = function(err, stdout, stderr) { cb(err, stdout); };
    child_process.execFile(binary, args, opts, cb2);
  })().wait();
};

var doOrThrow = function (f) {
  var ret;
  var messages = buildmessage.capture(function () {
    ret = f();
  });
  if (messages.hasMessages()) {
    throw Error(messages.formatMessages());
  }
  return ret;
};

// Our current strategy for running tests that need warehouses is to build all
// packages from the checkout into this temporary tropohouse directory, and for
// each test that need a fake warehouse, copy the built packages into the
// test-specific warehouse directory.  This isn't particularly fast, but it'll
// do for now. We build the packages during the first test that needs them.
var builtPackageTropohouseDir = null;
var tropohouseLocalCatalog = null;
var tropohouseIsopackCache = null;

// Let's build a minimal set of packages that's enough to get self-test
// working.  (And that doesn't need us to download any Atmosphere packages.)
var ROOT_PACKAGES_TO_BUILD_IN_SANDBOX = [
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
  "standard-minifiers",
  "es5-shim"
];

var setUpBuiltPackageTropohouse = function () {
  if (builtPackageTropohouseDir)
    return;
  builtPackageTropohouseDir = files.mkdtemp('built-package-tropohouse');

  if (config.getPackagesDirectoryName() !== 'packages')
    throw Error("running self-test with METEOR_PACKAGE_SERVER_URL set?");

  var tropohouse = new tropohouseModule.Tropohouse(builtPackageTropohouseDir);
  tropohouseLocalCatalog = newSelfTestCatalog();
  var versions = {};
  _.each(
    tropohouseLocalCatalog.getAllNonTestPackageNames(),
    function (packageName) {
      versions[packageName] =
        tropohouseLocalCatalog.getLatestVersion(packageName).version;
  });
  var packageMap = new packageMapModule.PackageMap(versions, {
    localCatalog: tropohouseLocalCatalog
  });
  // Make an isopack cache that doesn't automatically save isopacks to disk and
  // has no access to versioned packages.
  tropohouseIsopackCache = new isopackCacheModule.IsopackCache({
    packageMap: packageMap,
    includeCordovaUnibuild: true
  });
  doOrThrow(function () {
    buildmessage.enterJob("building self-test packages", function () {
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
  tropohouseIsopackCache.eachBuiltIsopack(function (name, isopack) {
    tropohouse._saveIsopack(isopack, name);
  });
};

var newSelfTestCatalog = function () {
  if (! files.inCheckout())
    throw Error("Only can build packages from a checkout");

  var catalogLocal = require('../packaging/catalog/catalog-local.js');
  var selfTestCatalog = new catalogLocal.LocalCatalog;
  var messages = buildmessage.capture(
    { title: "scanning local core packages" },
    function () {
      // When building a fake warehouse from a checkout, we use local packages,
      // but *ONLY THOSE FROM THE CHECKOUT*: not app packages or $PACKAGE_DIRS
      // packages.  One side effect of this: we really really expect them to all
      // build, and we're fine with dying if they don't (there's no worries
      // about needing to springboard).
      selfTestCatalog.initialize({
        localPackageSearchDirs: [files.pathJoin(
          files.getCurrentToolsDir(), 'packages')]
      });
    });
  if (messages.hasMessages()) {
    Console.arrowError("Errors while scanning core packages:");
    Console.printMessages(messages);
    throw new Error("scan failed?");
  }
  return selfTestCatalog;
};


///////////////////////////////////////////////////////////////////////////////
// Matcher
///////////////////////////////////////////////////////////////////////////////

// Handles the job of waiting until text is seen that matches a
// regular expression.

var Matcher = function (run) {
  var self = this;
  self.buf = "";
  self.ended = false;
  self.matchPattern = null;
  self.matchFuture = null;
  self.matchStrict = null;
  self.run = run; // used only to set a field on exceptions
};

_.extend(Matcher.prototype, {
  write: function (data) {
    var self = this;
    self.buf += data;
    self._tryMatch();
  },

  match: function (pattern, timeout, strict) {
    var self = this;
    if (self.matchFuture)
      throw new Error("already have a match pending?");
    self.matchPattern = pattern;
    self.matchStrict = strict;
    var f = self.matchFuture = new Future;
    self._tryMatch(); // could clear self.matchFuture

    var timer = null;
    if (timeout) {
      timer = setTimeout(function () {
        var pattern = self.matchPattern;
        self.matchPattern = null;
        self.matchStrict = null;
        self.matchFuture = null;
        f['throw'](new TestFailure('match-timeout', { run: self.run,
                                                      pattern: pattern }));
      }, timeout * 1000);
    }

    try {
      return f.wait();
    } finally {
      if (timer)
        clearTimeout(timer);
    }
  },

  end: function () {
    var self = this;
    self.ended = true;
    self._tryMatch();
  },

  matchEmpty: function () {
    var self = this;

    if (self.buf.length > 0) {
      Console.info("Extra junk is :", self.buf);
      throw new TestFailure('junk-at-end', { run: self.run });
    }
  },

  _tryMatch: function () {
    var self = this;

    var f = self.matchFuture;
    if (! f)
      return;

    var ret = null;

    if (self.matchPattern instanceof RegExp) {
      var m = self.buf.match(self.matchPattern);
      if (m) {
        if (self.matchStrict && m.index !== 0) {
          self.matchFuture = null;
          self.matchStrict = null;
          self.matchPattern = null;
          Console.info("Extra junk is: ", self.buf.substr(0, m.index));
          f['throw'](new TestFailure(
            'junk-before', { run: self.run, pattern: self.matchPattern }));
          return;
        }
        ret = m;
        self.buf = self.buf.slice(m.index + m[0].length);
      }
    } else {
      var i = self.buf.indexOf(self.matchPattern);
      if (i !== -1) {
        if (self.matchStrict && i !== 0) {
          self.matchFuture = null;
          self.matchStrict = null;
          self.matchPattern = null;
          Console.info("Extra junk is: ", self.buf.substr(0, i));
          f['throw'](new TestFailure('junk-before',
                                     { run: self.run, pattern: self.matchPattern }));
          return;
        }
        ret = self.matchPattern;
        self.buf = self.buf.slice(i + self.matchPattern.length);
      }
    }

    if (ret !== null) {
      self.matchFuture = null;
      self.matchStrict = null;
      self.matchPattern = null;
      f['return'](ret);
      return;
    }

    if (self.ended) {
      var failure = new TestFailure('no-match', { run: self.run,
                                                  pattern: self.matchPattern });
      self.matchFuture = null;
      self.matchStrict = null;
      self.matchPattern = null;
      f['throw'](failure);
      return;
    }
  }
});


///////////////////////////////////////////////////////////////////////////////
// OutputLog
///////////////////////////////////////////////////////////////////////////////

// Maintains a line-by-line merged log of multiple output channels
// (eg, stdout and stderr).

var OutputLog = function (run) {
  var self = this;

  // each entry is an object with keys 'channel', 'text', and if it is
  // the last entry and there was no newline terminator, 'bare'
  self.lines = [];

  // map from a channel name to an object representing a partially
  // read line of text on that channel. That object has keys 'text'
  // (text read), 'offset' (cursor position, equal to text.length
  // unless a '\r' has been read).
  self.buffers = {};

  // a Run, exclusively for inclusion in exceptions
  self.run = run;
};

_.extend(OutputLog.prototype, {
  write: function (channel, text) {
    var self = this;

    if (! _.has(self.buffers, 'channel'))
      self.buffers[channel] = { text: '', offset: 0};
    var b = self.buffers[channel];

    while (text.length) {
      var m = text.match(/^[^\n\r]+/);
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
        self.lines.push({ channel: channel, text: b.text });
        b.text = '';
        b.offset = 0;
        text = text.substr(1);
        continue;
      }

      throw new Error("conditions should have been exhaustive?");
    }
  },

  end: function () {
    var self = this;

    _.each(_.keys(self.buffers), function (channel) {
      if (self.buffers[channel].text.length) {
        self.lines.push({ channel: channel,
                          text: self.buffers[channel].text,
                          bare: true });
        self.buffers[channel] = { text: '', offset: 0};
      }
    });
  },

  forbid: function (pattern, channel) {
    var self = this;
    _.each(self.lines, function (line) {
      if (channel && channel !== line.channel)
        return;

      var match = (pattern instanceof RegExp) ?
        (line.text.match(pattern)) : (line.text.indexOf(pattern) !== -1);
      if (match)
        throw new TestFailure('forbidden-string-present', { run: self.run });
    });
  },

  get: function () {
    var self = this;
    return self.lines;
  }
});


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

var Sandbox = function (options) {
  var self = this;
  // default options
  options = _.extend({ clients: {} }, options);

  self.root = files.mkdtemp();
  self.warehouse = null;

  self.home = files.pathJoin(self.root, 'home');
  files.mkdir(self.home, 0o755);
  self.cwd = self.home;
  self.env = {};
  self.fakeMongo = options.fakeMongo;

  // By default, tests use the package server that this meteor binary is built
  // with. If a test is tagged 'test-package-server', it uses the test
  // server. Tests that publish packages should have this flag; tests that
  // assume that the release's packages can be found on the server should not.
  // Note that this only affects subprocess meteor runs, not direct invocation
  // of packageClient!
  if (_.contains(runningTest.tags, 'test-package-server')) {
    if (_.has(options, 'warehouse')) {
      // test-package-server and warehouse are basically two different ways of
      // sort of faking out the package system for tests.  test-package-server
      // means "use a specific production test server"; warehouse means "use
      // some fake files we put on disk and never sync" (see _makeEnv where the
      // offline flag is set).  Combining them doesn't make sense: either you
      // don't sync, in which case you don't see the stuff you published, or you
      // do sync, and suddenly the mock catalog we built is overridden by
      // test-package-server.
      // XXX we should just run servers locally instead of either of these
      //     strategies
      throw Error("test-package-server and warehouse cannot be combined");
    }

    self.set('METEOR_PACKAGE_SERVER_URL', exports.testPackageServerUrl);
  }

  if (_.has(options, 'warehouse')) {
    if (!files.inCheckout())
      throw Error("make only use a fake warehouse in a checkout");
    self.warehouse = files.pathJoin(self.root, 'tropohouse');
    self._makeWarehouse(options.warehouse);
  }

  self.clients = [new PhantomClient({
    host: 'localhost',
    port: options.clients.port || 3000
  })];

  if (options.clients && options.clients.browserstack) {
    var browsers = [
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

    _.each(browsers, function (browser) {
      self.clients.push(new BrowserStackClient({
        host: 'localhost',
        port: 3000,
        browserName: browser.browserName,
        browserVersion: browser.browserVersion,
        timeout: browser.timeout
      }));
    });
  }

  var meteorScript = process.platform === "win32" ? "meteor.bat" : "meteor";

  // Figure out the 'meteor' to run
  if (self.warehouse)
    self.execPath = files.pathJoin(self.warehouse, meteorScript);
  else
    self.execPath = files.pathJoin(files.getCurrentToolsDir(), meteorScript);
};

_.extend(Sandbox.prototype, {
  // Create a new test run of the tool in this sandbox.
  run: function (...args) {
    var self = this;

    return new Run(self.execPath, {
      sandbox: self,
      args: args,
      cwd: self.cwd,
      env: self._makeEnv(),
      fakeMongo: self.fakeMongo
    });
  },

  // Tests a set of clients with the argument function. Each call to f(run)
  // instantiates a Run with a different client.
  // Use:
  // sandbox.testWithAllClients(function (run) {
  //   // pre-connection checks
  //   run.connectClient();
  //   // post-connection checks
  // });
  testWithAllClients: function (f, ...args) {
    var self = this;
    args = _.compact(args);

    console.log("running test with " + self.clients.length + " client(s).");

    _.each(self.clients, function (client) {
      console.log("testing with " + client.name + "...");
      var run = new Run(self.execPath, {
        sandbox: self,
        args: args,
        cwd: self.cwd,
        env: self._makeEnv(),
        fakeMongo: self.fakeMongo,
        client: client
      });
      run.baseTimeout = client.timeout;
      f(run);
    });
  },

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
  createApp: function (to, template, options) {
    var self = this;
    options = options || {};
    var absoluteTo = files.pathJoin(self.cwd, to);
    files.cp_r(files.pathJoin(
      files.convertToStandardPath(__dirname), '..', 'tests', 'apps', template),
        absoluteTo, { ignore: [/^local$/] });
    // If the test isn't explicitly managing a mock warehouse, ensure that apps
    // run with our release by default.
    if (options.release) {
      self.write(files.pathJoin(to, '.meteor/release'), options.release);
    } else if (!self.warehouse && release.current.isProperRelease()) {
      self.write(files.pathJoin(to, '.meteor/release'), release.current.name);
    }

    // Make sure the apps don't run any upgraders, unless they intentionally
    // have a partial upgraders file
    var upgradersFile =
      new projectContextModule.FinishedUpgraders({projectDir: absoluteTo});
    if (_.isEmpty(upgradersFile.readUpgraders())) {
      upgradersFile.appendUpgraders(upgraders.allUpgraders());
    }

    if (options.dontPrepareApp)
      return;

    // Prepare the app (ie, build or download packages). We give this a nice
    // long timeout, which allows the next command to not need a bloated
    // timeout. (meteor create does this anyway.)
    self.cd(to, function () {
      var run = self.run("--prepare-app");
      // XXX Can we cache the output of running this once somewhere, so that
      // multiple calls to createApp with the same template get the same cache?
      // This is a little tricky because isopack-buildinfo.json uses absolute
      // paths.
      run.waitSecs(20);
      run.expectExit(0);
    });
  },

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
  createPackage: function (packageDir, packageName, template) {
    var self = this;
    var packagePath = files.pathJoin(self.cwd, packageDir);
    var templatePackagePath = files.pathJoin(
      files.convertToStandardPath(__dirname), '..', 'tests', 'packages', template);
    files.cp_r(templatePackagePath, packagePath);

    _.each(files.readdir(packagePath), function (file) {
      if (file.match(/^package.*\.js$/)) {
        var packageJsFile = files.pathJoin(packagePath, file);
        files.writeFile(
          packageJsFile,
          files.readFile(packageJsFile, "utf8")
            .replace("~package-name~", packageName));
      }
    });
  },

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
  cd: function (relativePath, callback) {
    var self = this;
    var previous = self.cwd;
    self.cwd = files.pathResolve(self.cwd, relativePath);
    if (callback) {
      callback();
      self.cwd = previous;
    }
  },

  // Set an environment variable for subsequent runs.
  set: function (name, value) {
    var self = this;
    self.env[name] = value;
  },

  // Undo set().
  unset: function (name) {
    var self = this;
    delete self.env[name];
  },

  // Write to a file in the sandbox, overwriting its current contents
  // if any. 'filename' is a path intepreted relative to the Sandbox's
  // cwd. 'contents' is a string (utf8 is assumed).
  write: function (filename, contents) {
    var self = this;
    files.writeFile(files.pathJoin(self.cwd, filename), contents, 'utf8');
  },

  // Like writeFile, but appends rather than writes.
  append: function (filename, contents) {
    var self = this;
    files.appendFile(files.pathJoin(self.cwd, filename), contents, 'utf8');
  },

  // Reads a file in the sandbox as a utf8 string. 'filename' is a
  // path intepreted relative to the Sandbox's cwd.  Returns null if
  // file does not exist.
  read: function (filename) {
    var self = this;
    var file = files.pathJoin(self.cwd, filename);
    if (!files.exists(file))
      return null;
    else
      return files.readFile(files.pathJoin(self.cwd, filename), 'utf8');
  },

  // Copy the contents of one file to another.  In these series of tests, we often
  // want to switch contents of package.js files. It is more legible to copy in
  // the backup file rather than trying to write into it manually.
  cp: function(from, to) {
    var self = this;
    var contents = self.read(from);
    if (!contents) {
      throw new Error("File " + from + " does not exist.");
    };
    self.write(to, contents);
  },

  // Delete a file in the sandbox. 'filename' is as in write().
  unlink: function (filename) {
    var self = this;
    files.unlink(files.pathJoin(self.cwd, filename));
  },

  // Make a directory in the sandbox. 'filename' is as in write().
  mkdir: function (dirname) {
    var self = this;
    var dirPath = files.pathJoin(self.cwd, dirname);
    if (! files.exists(dirPath)) {
      files.mkdir(dirPath);
    }
  },

  // Rename something in the sandbox. 'oldName' and 'newName' are as in write().
  rename: function (oldName, newName) {
    var self = this;
    files.rename(files.pathJoin(self.cwd, oldName),
                 files.pathJoin(self.cwd, newName));
  },

  // Return the current contents of .meteorsession in the sandbox.
  readSessionFile: function () {
    var self = this;
    return files.readFile(files.pathJoin(self.root, '.meteorsession'), 'utf8');
  },

  // Overwrite .meteorsession in the sandbox with 'contents'. You
  // could use this in conjunction with readSessionFile to save and
  // restore authentication states.
  writeSessionFile: function (contents) {
    var self = this;
    return files.writeFile(files.pathJoin(self.root, '.meteorsession'),
                           contents, 'utf8');
  },

  _makeEnv: function () {
    var self = this;
    var env = _.clone(self.env);
    env.METEOR_SESSION_FILE = files.convertToOSPath(
      files.pathJoin(self.root, '.meteorsession'));

    if (self.warehouse) {
      // Tell it where the warehouse lives.
      env.METEOR_WAREHOUSE_DIR = files.convertToOSPath(self.warehouse);

      // Don't ever try to refresh the stub catalog we made.
      env.METEOR_OFFLINE_CATALOG = "t";
    }

    // By default (ie, with no mock warehouse and no --release arg) we should be
    // testing the actual release this is built in, so we pretend that it is the
    // latest release.
    if (!self.warehouse && release.current.isProperRelease())
      env.METEOR_TEST_LATEST_RELEASE = release.current.name;
    return env;
  },

  // Writes a stub warehouse (really a tropohouse) to the directory
  // self.warehouse. This warehouse only contains a meteor-tool package and some
  // releases containing that tool only (and no packages).
  //
  // packageServerUrl indicates which package server we think we are using. Use
  // the default, if we do not pass this in; you should pass it in any case that
  // you will be specifying $METEOR_PACKAGE_SERVER_URL in the environment of a
  // command you are running in this sandbox.
  _makeWarehouse: function (releases) {
    var self = this;

    // Ensure we have a tropohouse to copy stuff out of.
    setUpBuiltPackageTropohouse();

    var serverUrl = self.env.METEOR_PACKAGE_SERVER_URL;
    var packagesDirectoryName = config.getPackagesDirectoryName(serverUrl);
    files.cp_r(files.pathJoin(builtPackageTropohouseDir, 'packages'),
               files.pathJoin(self.warehouse, packagesDirectoryName),
               { preserveSymlinks: true });

    var stubCatalog = {
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

    var packageVersions = {};
    var toolPackageVersion = null;

    tropohouseIsopackCache.eachBuiltIsopack(function (packageName, isopack) {
      var packageRec = tropohouseLocalCatalog.getPackage(packageName);
      if (! packageRec)
        throw Error("no package record for " + packageName);
      stubCatalog.collections.packages.push(packageRec);

      var versionRec = tropohouseLocalCatalog.getLatestVersion(packageName);
      if (! versionRec)
        throw Error("no version record for " + packageName);
      stubCatalog.collections.versions.push(versionRec);

      stubCatalog.collections.builds.push({
        buildArchitectures: isopack.buildArchitectures(),
        versionId: versionRec._id,
        _id: utils.randomToken()
      });

      if (packageName === "meteor-tool") {
        toolPackageVersion = versionRec.version;
      } else {
        packageVersions[packageName] = versionRec.version;
      }
    });

    if (! toolPackageVersion)
      throw Error("no meteor-tool?");

    stubCatalog.collections.releaseTracks.push({
      name: catalog.DEFAULT_TRACK,
      _id: utils.randomToken()
    });

    // Now create each requested release.
    _.each(releases, function (configuration, releaseName) {
      // Release info
      stubCatalog.collections.releaseVersions.push({
        track: catalog.DEFAULT_TRACK,
        _id: Math.random().toString(),
        version: releaseName,
        orderKey: releaseName,
        description: "test release " + releaseName,
        recommended: !!configuration.recommended,
        tool: configuration.tool || "meteor-tool@" + toolPackageVersion,
        packages: packageVersions
      });
    });

    var dataFile = config.getPackageStorage({
      root: self.warehouse,
      serverUrl: serverUrl
    });
    self.warehouseOfficialCatalog = new catalogRemote.RemoteCatalog();
    self.warehouseOfficialCatalog.initialize({
      packageStorage: dataFile
    });
    self.warehouseOfficialCatalog.insertData(stubCatalog);

    // And a cherry on top
    // XXX this is hacky
    files.linkToMeteorScript(
      files.pathJoin(self.warehouse, packagesDirectoryName, "meteor-tool", toolPackageVersion,
        'mt-' + archinfo.host(), 'meteor'),
      files.pathJoin(self.warehouse, 'meteor'));
  }
});

///////////////////////////////////////////////////////////////////////////////
// Client
///////////////////////////////////////////////////////////////////////////////

var Client = function (options) {
  var self = this;

  self.host = options.host;
  self.port = options.port;
  self.url = "http://" + self.host + ":" + self.port + '/' +
    (Math.random() * 0x100000000 + 1).toString(36);
  self.timeout = options.timeout || 40;

  if (! self.connect || ! self.stop) {
    console.log("Missing methods in subclass of Client.");
  }
};

// PhantomClient
var PhantomClient = function (options) {
  var self = this;
  Client.apply(this, arguments);

  self.name = "phantomjs";
  self.process = null;

  self._logError = true;
};

util.inherits(PhantomClient, Client);

_.extend(PhantomClient.prototype, {
  connect: function () {
    var self = this;

    var phantomPath = phantomjs.path;

    var scriptPath = files.pathJoin(files.getCurrentToolsDir(), "tools",
      "tool-testing", "phantom", "open-url.js");
    self.process = child_process.execFile(phantomPath, ["--load-images=no",
      files.convertToOSPath(scriptPath), self.url],
      {}, function (error, stdout, stderr) {
        if (self._logError && error) {
          console.log("PhantomJS exited with error ", error, "\nstdout:\n", stdout, "\nstderr:\n", stderr);
        }
      });
  },

  stop: function() {
    var self = this;
    // Suppress the expected SIGTERM exit 'failure'
    self._logError = false;
    self.process && self.process.kill();
    self.process = null;
  }
});

// BrowserStackClient
var browserStackKey = null;

var BrowserStackClient = function (options) {
  var self = this;
  Client.apply(this, arguments);

  self.tunnelProcess = null;
  self.driver = null;

  self.browserName = options.browserName;
  self.browserVersion = options.browserVersion;

  self.name = "BrowserStack - " + self.browserName;
  if (self.browserVersion) {
    self.name += " " + self.browserVersion;
  }
};

util.inherits(BrowserStackClient, Client);

_.extend(BrowserStackClient.prototype, {
  connect: function () {
    var self = this;

    // memoize the key
    if (browserStackKey === null)
      browserStackKey = self._getBrowserStackKey();
    if (! browserStackKey)
      throw new Error("BrowserStack key not found. Ensure that you " +
        "have installed your S3 credentials.");

    var capabilities = {
      'browserName' : self.browserName,
      'browserstack.user' : 'meteor',
      'browserstack.local' : 'true',
      'browserstack.key' : browserStackKey
    };

    if (self.browserVersion) {
      capabilities.browserVersion = self.browserVersion;
    }

    self._launchBrowserStackTunnel(function (error) {
      if (error)
        throw error;

      self.driver = new webdriver.Builder().
        usingServer('http://hub.browserstack.com/wd/hub').
        withCapabilities(capabilities).
        build();
      self.driver.get(self.url);
    });
  },

  stop: function() {
    var self = this;
    self.tunnelProcess && self.tunnelProcess.kill();
    self.tunnelProcess = null;

    self.driver && self.driver.quit();
    self.driver = null;
  },

  _getBrowserStackKey: function () {
    var outputDir = files.pathJoin(files.mkdtemp(), "key");

    try {
      execFileSync("s3cmd", ["get",
        "s3://meteor-browserstack-keys/browserstack-key",
        outputDir
      ]);

      return files.readFile(outputDir, "utf8").trim();
    } catch (e) {
      return null;
    }
  },

  _launchBrowserStackTunnel: function (callback) {
    var self = this;
    var browserStackPath =
      files.pathJoin(files.getDevBundle(), 'bin', 'BrowserStackLocal');
    files.chmod(browserStackPath, 0o755);

    var args = [
      browserStackPath,
      browserStackKey,
      [self.host, self.port, 0].join(','),
      // Disable Live Testing and Screenshots, just test with Automate.
      '-onlyAutomate',
      // Do not wait for the server to be ready to spawn the process.
      '-skipCheck'
    ];
    self.tunnelProcess = child_process.execFile(
      '/bin/bash',
      ['-c', args.join(' ')]
    );

    // Called when the SSH tunnel is established.
    self.tunnelProcess.stdout.on('data', function(data) {
      if (data.toString().match(/You can now access your local server/))
        callback();
    });
  }
});

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
var Run = function (execPath, options) {
  var self = this;

  self.execPath = execPath;
  self.cwd = options.cwd || files.convertToStandardPath(process.cwd());
  // default env variables
  self.env = _.extend({ SELFTEST: "t", METEOR_NO_WORDWRAP: "t" }, options.env);
  self._args = [];
  self.proc = null;
  self.baseTimeout = 20;
  self.extraTime = 0;
  self.client = options.client;

  self.stdoutMatcher = new Matcher(self);
  self.stderrMatcher = new Matcher(self);
  self.outputLog = new OutputLog(self);

  self.exitStatus = undefined; // 'null' means failed rather than exited
  self.exitFutures = [];

  var opts = options.args || [];
  self.args.apply(self, opts || []);

  self.fakeMongoPort = null;
  self.fakeMongoConnection = null;
  if (options.fakeMongo) {
    self.fakeMongoPort = require('../utils/utils.js').randomPort();
    self.env.METEOR_TEST_FAKE_MONGOD_CONTROL_PORT = self.fakeMongoPort;
  }

  runningTest.onCleanup(function () {
    self._stopWithoutWaiting();
  });
};

_.extend(Run.prototype, {
  // Set command-line arguments. This may be called multiple times as
  // long as the run has not yet started (the run starts after the
  // first call to a function that requires it, like match()).
  //
  // Pass as many arguments as you want. Non-object values will be
  // cast to string, and object values will be treated as maps from
  // option names to values.
  args: function (...args) {
    var self = this;

    if (self.proc)
      throw new Error("already started?");

    _.each(args, function (a) {
      if (typeof a !== "object") {
        self._args.push('' + a);
      } else {
        _.each(a, function (value, key) {
          self._args.push("--" + key);
          self._args.push('' + value);
        });
      }
    });

  },

  connectClient: function () {
    var self = this;
    if (! self.client)
      throw new Error("Must create Run with a client to use connectClient().");

    self._ensureStarted();
    self.client.connect();
  },

  _exited: function (status) {
    var self = this;

    if (self.exitStatus !== undefined)
      throw new Error("already exited?");

    self.client && self.client.stop();

    self.exitStatus = status;
    var exitFutures = self.exitFutures;
    self.exitFutures = null;
    _.each(exitFutures, function (f) {
      f['return']();
    });

    self.stdoutMatcher.end();
    self.stderrMatcher.end();
  },

  _ensureStarted: function () {
    var self = this;

    if (self.proc)
      return;

    var env = _.clone(process.env);
    _.extend(env, self.env);

    self.proc = child_process.spawn(files.convertToOSPath(self.execPath),
      self._args, {
        cwd: files.convertToOSPath(self.cwd),
        env: env
      });

    self.proc.on('close', function (code, signal) {
      if (self.exitStatus === undefined)
        self._exited({ code: code, signal: signal });
    });

    self.proc.on('exit', function (code, signal) {
      if (self.exitStatus === undefined)
        self._exited({ code: code, signal: signal });
    });

    self.proc.on('error', function (err) {
      if (self.exitStatus === undefined)
        self._exited(null);
    });

    self.proc.stdout.setEncoding('utf8');
    self.proc.stdout.on('data', function (data) {
      self.outputLog.write('stdout', data);
      self.stdoutMatcher.write(data);
    });

    self.proc.stderr.setEncoding('utf8');
    self.proc.stderr.on('data', function (data) {
      self.outputLog.write('stderr', data);
      self.stderrMatcher.write(data);
    });
  },

  // Wait until we get text on stdout that matches 'pattern', which
  // may be a regular expression or a string. Consume stdout up to
  // that point. If this pattern does not appear after a timeout (or
  // the program exits before emitting the pattern), fail.
  match: markStack(function (pattern, _strict) {
    var self = this;
    self._ensureStarted();

    var timeout = self.baseTimeout + self.extraTime;
    timeout *= utils.timeoutScaleFactor;
    self.extraTime = 0;
    return self.stdoutMatcher.match(pattern, timeout, _strict);
  }),

  // As expect(), but for stderr instead of stdout.
  matchErr: markStack(function (pattern, _strict) {
    var self = this;
    self._ensureStarted();

    var timeout = self.baseTimeout + self.extraTime;
    timeout *= utils.timeoutScaleFactor;
    self.extraTime = 0;
    return self.stderrMatcher.match(pattern, timeout, _strict);
  }),

  // Like match(), but won't skip ahead looking for a match. It must
  // follow immediately after the last thing we matched or read.
  read: markStack(function (pattern) {
    return this.match(pattern, true);
  }),

  // As read(), but for stderr instead of stdout.
  readErr: markStack(function (pattern) {
    return this.matchErr(pattern, true);
  }),

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
  forbid: markStack(function (pattern) {
    this._ensureStarted();
    this.outputLog.forbid(pattern, 'stdout');
  }),

  // As forbid(), but for stderr instead of stdout.
  forbidErr: markStack(function (pattern) {
    this._ensureStarted();
    this.outputLog.forbid(pattern, 'stderr');
  }),

  // Combination of forbid() and forbidErr(). Forbids the pattern on
  // both stdout and stderr.
  forbidAll: markStack(function (pattern) {
    this._ensureStarted();
    this.outputLog.forbid(pattern);
  }),

  // Expect the program to exit without anything further being
  // printed on either stdout or stderr.
  expectEnd: markStack(function () {
    var self = this;
    self._ensureStarted();

    var timeout = self.baseTimeout + self.extraTime;
    timeout *= utils.timeoutScaleFactor;
    self.extraTime = 0;
    self.expectExit();

    self.stdoutMatcher.matchEmpty();
    self.stderrMatcher.matchEmpty();
  }),

  // Expect the program to exit with the given (numeric) exit
  // status. Fail if the process exits with a different code, or if
  // the process does not exit after a timeout. You can also omit the
  // argument to simply wait for the program to exit.
  expectExit: markStack(function (code) {
    var self = this;
    self._ensureStarted();

    if (self.exitStatus === undefined) {
      var timeout = self.baseTimeout + self.extraTime;
      timeout *= utils.timeoutScaleFactor;
      self.extraTime = 0;

      var fut = new Future;
      self.exitFutures.push(fut);
      var timer = setTimeout(function () {
        self.exitFutures = _.without(self.exitFutures, fut);
        fut['throw'](new TestFailure('exit-timeout', { run: self }));
      }, timeout * 1000);

      try {
        fut.wait();
      } finally {
        clearTimeout(timer);
      }
    }

    if (! self.exitStatus)
      throw new TestFailure('spawn-failure', { run: self });
    if (code !== undefined && self.exitStatus.code !== code) {
      throw new TestFailure('wrong-exit-code', {
        expected: { code: code },
        actual: self.exitStatus,
        run: self
      });
    }
  }),

  // Extend the timeout for the next operation by 'secs' seconds.
  waitSecs: function (secs) {
    var self = this;
    self.extraTime += secs;
  },

  // Send 'string' to the program on its stdin.
  write: function (string) {
    var self = this;
    self._ensureStarted();
    self.proc.stdin.write(string);
  },

  // Kill the program and then wait for it to actually exit.
  stop: markStack(function () {
    var self = this;
    if (self.exitStatus === undefined) {
      self._ensureStarted();
      self.client && self.client.stop();
      self._killProcess();
      self.expectExit();
    }
  }),

  // Like stop, but doesn't wait for it to exit.
  _stopWithoutWaiting: function () {
    var self = this;
    if (self.exitStatus === undefined && self.proc) {
      self.client && self.client.stop();
      self._killProcess();
    }
  },

  // Kills the running process and it's child processes
  _killProcess: function () {
    if (!this.proc)
      throw new Error("Unexpected: `this.proc` undefined when calling _killProcess");

    if (process.platform === "win32") {
      // looks like in Windows `self.proc.kill()` doesn't kill child
      // processes.
      utils.execFileSync("taskkill", ["/pid", this.proc.pid, '/f', '/t']);
    } else {
      this.proc.kill();
    }
  },

  // If the fakeMongo option was set, sent a command to the stub
  // mongod. Available commands currently are:
  //
  // - { stdout: "xyz" } to make fake-mongod write "xyz" to stdout
  // - { stderr: "xyz" } likewise for stderr
  // - { exit: 123 } to make fake-mongod exit with code 123
  //
  // Blocks until a connection to fake-mongod can be
  // established. Throws a TestFailure if it cannot be established.
  tellMongo: markStack(function (command) {
    var self = this;

    if (! self.fakeMongoPort)
      throw new Error("fakeMongo option on sandbox must be set");

    self._ensureStarted();

    // If it's the first time we've called tellMongo on this sandbox,
    // open a connection to fake-mongod. Wait up to 10 seconds for it
    // to accept the connection, retrying every 100ms.
    //
    // XXX we never clean up this connection. Hopefully once
    // fake-mongod has dropped its end of the connection, and we hold
    // no reference to our end, it will get gc'd. If not, that's not
    // great, but it probably doesn't actually create any practical
    // problems since this is only for testing.
    if (! self.fakeMongoConnection) {
      var net = require('net');

      var lastStartTime = 0;
      for (var attempts = 0; ! self.fakeMongoConnection && attempts < 100;
           attempts ++) {
        // Throttle attempts to one every 100ms
        utils.sleepMs((lastStartTime + 100) - (+ new Date));
        lastStartTime = +(new Date);

        // Use an anonymous function so that each iteration of the
        // loop gets its own values of 'fut' and 'conn'.
        (function () {
          var fut = new Future;
          var conn = net.connect(self.fakeMongoPort, function () {
            if (fut)
              fut['return'](true);
          });
          conn.setNoDelay();
          conn.on('error', function () {
            if (fut)
              fut['return'](false);
          });
          setTimeout(function () {
            if (fut)
              fut['return'](false); // 100ms connection timeout
          }, 100);

          // This is all arranged so that if a previous attempt
          // belatedly succeeds, somehow, we ignore it.
          if (fut.wait())
            self.fakeMongoConnection = conn;
          fut = null;
        })();
      }

      if (! self.fakeMongoConnection)
        throw new TestFailure("mongo-not-running", { run: self });
    }

    self.fakeMongoConnection.write(JSON.stringify(command) + "\n");
    // If we told it to exit, then we should close our end and connect again if
    // asked to send more.
    if (command.exit) {
      self.fakeMongoConnection.end();
      self.fakeMongoConnection = null;
    }
  })
});


///////////////////////////////////////////////////////////////////////////////
// Defining tests
///////////////////////////////////////////////////////////////////////////////

var Test = function (options) {
  var self = this;
  self.name = options.name;
  self.file = options.file;
  self.fileHash = options.fileHash;
  self.tags = options.tags || [];
  self.f = options.func;
  self.cleanupHandlers = [];
};

_.extend(Test.prototype, {
  onCleanup: function (cleanupHandler) {
    this.cleanupHandlers.push(cleanupHandler);
  },
  cleanup: function () {
    var self = this;
    _.each(self.cleanupHandlers, function (cleanupHandler) {
      cleanupHandler();
    });
    self.cleanupHandlers = [];
  }
});

var allTests = null;
var fileBeingLoaded = null;
var fileBeingLoadedHash = null;
var runningTest = null;
var getAllTests = function () {
  if (allTests)
    return allTests;
  allTests = [];

  // Load all files in the 'tests' directory that end in .js. They
  // are supposed to then call define() to register their tests.
  var testdir = files.pathJoin(__dirname, '..', 'tests');
  var filenames = files.readdir(testdir);
  _.each(filenames, function (n) {
    if (! n.match(/^[^.].*\.js$/)) // ends in '.js', doesn't start with '.'
      return;
    try {
      if (fileBeingLoaded)
        throw new Error("called recursively?");
      fileBeingLoaded = files.pathBasename(n, '.js');

      var fullPath = files.pathJoin(testdir, n);
      var contents = files.readFile(fullPath, 'utf8');
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

var define = function (name, tagsList, f) {
  if (typeof tagsList === "function") {
    // tagsList is optional
    f = tagsList;
    tagsList = [];
  }

  var tags = tagsList.slice();
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

var tagDescriptions = {
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
  'in other files': ""
};

// Returns a TestList object representing a filtered list of tests,
// according to the options given (which are based closely on the
// command-line arguments).  Used as the first step of both listTests
// and runTests.
//
// Options: testRegexp, fileRegexp, onlyChanged, offline, includeSlowTests, galaxyOnly
var getFilteredTests = function (options) {
  options = options || {};
  var allTests = getAllTests();

  if (allTests.length) {
    var testState = readTestState();

    // Add pseudo-tags 'non-matching', 'unchanged', 'non-galaxy' and 'in other
    // files' (but only so that we can then skip tests with those tags)
    allTests = allTests.map(function (test) {
      var newTags = [];

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
      if ( _.indexOf(test.tags, "galaxy") === -1) {
        newTags.push('non-galaxy');
      }

      if (! newTags.length) {
        return test;
      }

      return _.extend({}, test, { tags: test.tags.concat(newTags) });
    });
  }

  // (order of tags is significant to the "skip counts" that are displayed)
  var tagsToSkip = [];
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

  if (process.platform === "win32") {
    tagsToSkip.push("cordova");
    tagsToSkip.push("yet-unsolved-windows-failure");
  } else {
    tagsToSkip.push("windows");
  }

  return new TestList(allTests, tagsToSkip, testState);
};

// A TestList is the result of getFilteredTests.  It holds the original
// list of all tests, the filtered list, and stats on how many tests
// were skipped (see generateSkipReport).
//
// TestList also has code to save the hashes of files where all tests
// ran and passed (for the `--changed` option).  If a testState is
// provided, the notifyFailed and saveTestState can be used to modify
// the testState appropriately and write it out.
var TestList = function (allTests, tagsToSkip, testState) {
  tagsToSkip = (tagsToSkip || []);
  testState = (testState || null); // optional

  var self = this;
  self.allTests = allTests;
  self.skippedTags = tagsToSkip;
  self.skipCounts = {};
  self.testState = testState;

  _.each(tagsToSkip, function (tag) {
    self.skipCounts[tag] = 0;
  });

  self.fileInfo = {}; // path -> {hash, hasSkips, hasFailures}

  self.filteredTests = _.filter(allTests, function (test) {

    if (! self.fileInfo[test.file]) {
      self.fileInfo[test.file] = {
        hash: test.fileHash,
        hasSkips: false,
        hasFailures: false
      };
    }
    var fileInfo = self.fileInfo[test.file];

    // We look for tagsToSkip *in order*, and when we decide to
    // skip a test, we don't keep looking at more tags, and we don't
    // add the test to any further "skip counts".
    return !_.any(tagsToSkip, function (tag) {
      if (_.contains(test.tags, tag)) {
        self.skipCounts[tag]++;
        fileInfo.hasSkips = true;
        return true;
      } else {
        return false;
      }
    });
  });
};

// Mark a test's file as having failures.  This prevents
// saveTestState from saving its hash as a potentially
// "unchanged" file to be skipped in a future run.
TestList.prototype.notifyFailed = function (test) {
  this.fileInfo[test.file].hasFailures = true;
};

// If this TestList was constructed with a testState,
// modify it and write it out based on which tests
// were skipped and which tests had failures.
TestList.prototype.saveTestState = function () {
  var self = this;
  var testState = self.testState;
  if (! (testState && self.filteredTests.length)) {
    return;
  }

  _.each(self.fileInfo, function (info, f) {
    if (info.hasFailures) {
      delete testState.lastPassedHashes[f];
    } else if (! info.hasSkips) {
      testState.lastPassedHashes[f] = info.hash;
    }
  });

  writeTestState(testState);
};

// Return a string like "Skipped 1 foo test\nSkipped 5 bar tests\n"
TestList.prototype.generateSkipReport = function () {
  var self = this;
  var result = '';

  _.each(self.skippedTags, function (tag) {
    var count = self.skipCounts[tag];
    if (count) {
      var noun = "test" + (count > 1 ? "s" : ""); // "test" or "tests"
      // "non-matching tests" or "tests in other files"
      var nounPhrase = (/ /.test(tag) ?
                        (noun + " " + tag) : (tag + " " + noun));
      // " (foo)" or ""
      var parenthetical = (tagDescriptions[tag] ? " (" +
                           tagDescriptions[tag] + ")" : '');
      result += ("Skipped " + count + " " + nounPhrase + parenthetical + '\n');
    }
  });

  return result;
};

var getTestStateFilePath = function () {
  return files.pathJoin(files.getHomeDir(), '.meteortest');
};

var readTestState = function () {
  var testStateFile = getTestStateFilePath();
  var testState;
  if (files.exists(testStateFile))
    testState = JSON.parse(files.readFile(testStateFile, 'utf8'));
  if (! testState || testState.version !== 1)
    testState = { version: 1, lastPassedHashes: {} };
  return testState;
};

var writeTestState = function (testState) {
  var testStateFile = getTestStateFilePath();
  files.writeFile(testStateFile, JSON.stringify(testState), 'utf8');
};

// Same options as getFilteredTests.  Writes to stdout and stderr.
var listTests = function (options) {
  var testList = getFilteredTests(options);

  if (! testList.allTests.length) {
    Console.error("No tests defined.\n");
    return;
  }

  _.each(_.groupBy(testList.filteredTests, 'file'), function (tests, file) {
    Console.rawInfo(file + ':\n');
    _.each(tests, function (test) {
      Console.rawInfo('  - ' + test.name +
                      (test.tags.length ? ' [' + test.tags.join(' ') + ']'
                      : '') + '\n');
    });
  });

  Console.error();
  Console.error(testList.filteredTests.length + " tests listed.");
  Console.error(testList.generateSkipReport());
};

///////////////////////////////////////////////////////////////////////////////
// Running tests
///////////////////////////////////////////////////////////////////////////////

// options: onlyChanged, offline, includeSlowTests, historyLines, testRegexp,
//          fileRegexp,
//          clients:
//             - browserstack (need s3cmd credentials)
var runTests = function (options) {
  var testList = getFilteredTests(options);

  if (! testList.allTests.length) {
    Console.error("No tests defined.");
    return 0;
  }

  var totalRun = 0;
  var failedTests = [];

  _.each(testList.filteredTests, function (test) {
    totalRun++;
    Console.error(test.file + ": " + test.name + " ... ");

    var failure = null;
    try {
      runningTest = test;
      var startTime = +(new Date);
      test.f(options);
    } catch (e) {
      failure = e;
    } finally {
      runningTest = null;
      test.cleanup();
    }

    if (failure) {
      Console.error("... fail!", Console.options({ indent: 2 }));
      failedTests.push(test);
      testList.notifyFailed(test);

      if (failure instanceof TestFailure) {
        var frames = parseStack.parse(failure).outsideFiber;
        var relpath = files.pathRelative(files.getCurrentToolsDir(),
                                         frames[0].file);
        Console.rawError("  => " + failure.reason + " at " +
                         relpath + ":" + frames[0].line + "\n");
        if (failure.reason === 'no-match' || failure.reason === 'junk-before' ||
            failure.reason === 'match-timeout') {
          Console.arrowError("Pattern: " + failure.details.pattern, 2);
        }
        if (failure.reason === "wrong-exit-code") {
          var s = function (status) {
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
          var lines = failure.details.run.outputLog.get();
          if (! lines.length) {
            Console.arrowError("No output", 2);
          } else {
            var historyLines = options.historyLines || 100;

            Console.arrowError("Last " + historyLines + " lines:", 2);
            _.each(lines.slice(-historyLines), function (line) {
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
    } else {
      var durationMs = +(new Date) - startTime;
      Console.error(
        "... ok (" + durationMs + " ms)",
        Console.options({ indent: 2 }));
    }
  });

  testList.saveTestState();

  if (totalRun > 0)
    Console.error();

  Console.error(testList.generateSkipReport());

  if (testList.filteredTests.length === 0) {
    Console.error("No tests run.");
    return 0;
  } else if (failedTests.length === 0) {
    var disclaimers = '';
    if (testList.filteredTests.length < testList.allTests.length)
      disclaimers += " other";
    Console.error("All" + disclaimers + " tests passed.");
    return 0;
  } else {
    var failureCount = failedTests.length;
    Console.error(failureCount + " failure" +
                  (failureCount > 1 ? "s" : "") + ":");
    _.each(failedTests, function (test) {
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

_.extend(exports, {
  runTests: runTests,
  listTests: listTests,
  markStack: markStack,
  define: define,
  Sandbox: Sandbox,
  Run: Run,
  fail: fail,
  expectEqual: expectEqual,
  expectThrows: expectThrows,
  expectTrue: expectTrue,
  expectFalse: expectFalse,
  execFileSync: execFileSync,
  doOrThrow: doOrThrow,
  testPackageServerUrl: config.getTestPackageServerUrl()
});
