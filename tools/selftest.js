var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var files = require('./files.js');
var parseStack = require('./parse-stack.js');
var release = require('./release.js');
var Future = require('fibers/future');

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
        self.matchPattern = null;
        self.matchStrict = null;
        self.matchFuture = null;
        f['throw'](new TestFailure('match-timeout', { run: self.run }));
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
    self.buf = '';
  },

  matchEmpty: function () {
    var self = this;

    if (self.buf.length > 0)
      throw new TestFailure('junk-at-end', { run: self.run });
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
          f['throw'](new TestFailure('junk-before', { run: self.run }));
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
          f['throw'](new TestFailure('junk-before', { run: self.run }));
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
      self.matchFuture = null;
      self.matchStrict = null;
      self.matchPattern = null;
      f['throw'](new TestFailure('no-match', { run: self.run }));
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

  // map from a channel number name to a string (partially read line
  // of text on that channel)
  self.buffers = {};

  // a Run, exclusively for inclusion in exceptions
  self.run = run;
};

_.extend(OutputLog.prototype, {
  write: function (channel, text) {
    var self = this;

    if (! _.has(self.buffers, 'channel'))
      self.buffers[channel] = '';

    self.buffers[channel] += text;
    while (true) {
      var i = self.buffers[channel].indexOf('\n');
      if (i === -1)
        break;
      self.lines.push({ channel: channel,
                        text: self.buffers[channel].substr(0, i) });
      self.buffers[channel] = self.buffers[channel].substr(i + 1);
    }
  },

  end: function () {
    var self = this;
    _.each(_.keys(self.buffers), function (channel) {
      if (self.buffers[channel].length) {
        self.lines.push({ channel: channel,
                          text: self.buffers[channel],
                          bare: true });
        self.buffers[channel] = '';
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
var Sandbox = function (options) {
  var self = this;
  options = options || {};
  self.root = files.mkdtemp();
  self.warehouse = null;

  self.home = path.join(self.root, 'home');
  fs.mkdirSync(self.home, 0755);
  self.cwd = self.home;
  self.env = {};

  if (_.has(options, 'warehouse')) {
    // Make a directory to hold our new warehouse
    self.warehouse = path.join(self.root, 'warehouse');
    fs.mkdirSync(self.warehouse, 0755);
    fs.mkdirSync(path.join(self.warehouse, 'releases'), 0755);
    fs.mkdirSync(path.join(self.warehouse, 'tools'), 0755);
    fs.mkdirSync(path.join(self.warehouse, 'packages'), 0755);

    // Build all packages and symlink them into the warehouse. Make up
    // random version names for each one.
    var listResult = release.current.library.list();
    var pkgVersions = {};
    if (! listResult.packages)
      throw new TestFailure('build-failure', { messages: listResult.messages });
    var packages = listResult.packages;
    _.each(packages, function (pkg, name) {
      // XXX we rely on the fact that library.list() forces all of the
      // packages to be built. #ListingPackagesImpliesBuildingThem
      var version = 'v' + ('' + Math.random()).substr(2, 4); // eg, "v5324"
      pkgVersions[name] = version;
      fs.mkdirSync(path.join(self.warehouse, 'packages', name), 0755);
      fs.symlinkSync(
        path.resolve(files.getCurrentToolsDir(), 'packages', name, '.build'),
        path.join(self.warehouse, 'packages', name, version)
      );
    });

    // Now create each requested release.
    var seenLatest = false;
    var createdTools = {};
    _.each(options.warehouse, function (config, releaseName) {
      var toolsVersion = config.tools || releaseName;

      // Release info
      var manifest = {
        tools: toolsVersion,
        packages: pkgVersions,
        upgraders: config.upgraders
      };
      fs.writeFileSync(path.join(self.warehouse, 'releases',
                                 releaseName + ".release.json"),
                       JSON.stringify(manifest), 'utf8');
      if (config.notices) {
        fs.writeFileSync(path.join(self.warehouse, 'releases',
                                   releaseName + ".notices.json"),
                         JSON.stringify(config.notices), 'utf8');
      }

      // Tools
      if (! createdTools[toolsVersion]) {
        fs.symlinkSync(buildTools(toolsVersion),
                       path.join(self.warehouse, 'tools', toolsVersion));
        createdTools[toolsVersion] = true;
      }

      // Latest?
      if (config.latest) {
        if (seenLatest)
          throw new Error("multiple releases marked as latest?");
        fs.symlinkSync(
          releaseName + ".release.json",
          path.join(self.warehouse, 'releases', 'latest')
        );
        fs.symlinkSync(toolsVersion,
                       path.join(self.warehouse, 'tools', 'latest'));
        seenLatest = true;
      }
    });

    if (! seenLatest)
      throw new Error("no release marked as latest?");

    // And a cherry on top
    fs.symlinkSync("tools/latest/bin/meteor",
                   path.join(self.warehouse, 'meteor'));
  }
};

_.extend(Sandbox.prototype, {
  // Create a new test run of the tool in this sandbox.
  run: function (/* arguments */) {
    var self = this;
    return new Run({
      sandbox: self,
      args: _.toArray(arguments),
      cwd: self.cwd,
      env: _.clone(self.env)
    });
  },

  // Copy an app from a template into the current directory in the
  // sandbox. 'to' is the subdirectory to put the app in, and
  // 'template' is a subdirectory of tools/selftests/apps to copy.
  //
  // Note that the arguments are the opposite order from 'cp'. That
  // seems more intuitive to me -- if you disagree, my apologies.
  //
  // For example:
  //   s.copyApp('myapp', 'empty');
  //   s.cd('myapp');
  createApp: function (to, template) {
    var self = this;
    files.cp_r(path.join(__dirname, 'selftests', 'apps', template),
               path.join(self.cwd, to));
  },

  // Change the cwd to be used for subsequent runs. For example:
  //   s.run('create', 'myapp').expectExit(0);
  //   s.cd('myapp');
  //   s.run('add', 'somepackage') ...
  cd: function (relativePath) {
    var self = this;
    self.cwd = path.resolve(self.cwd, relativePath);
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
    fs.writeFileSync(path.join(self.cwd, filename), contents, 'utf8');
  },

  // Delete a file in the sandbox. 'filename' is as in write().
  unlink: function (filename) {
    var self = this;
    fs.unlinkSync(path.join(self.cwd, filename));
  }
});


// Build a tools release into a temporary directory (based on the
// current checkout), and gives it a version name of
// 'version'. Returns the directory.
//
// This is memorized for speed (multiple calls with the same version
// name may return the same directory), and furthermore I'm not going
// to promise that it doesn't contain symlinks to your dev_bundle and
// so forth. So don't modify anything in the returned directory.
//
// This function is not reentrant.
var toolBuildRoot = null;
var toolBuildCache = {};
var buildTools = function (version) {
  if (_.has(toolBuildCache, version))
    return toolBuildCache[version];

  if (! toolBuildRoot)
    toolBuildRoot = files.mkdtemp();
  var outputDir = path.join(toolBuildRoot, version);

  var child_process = require("child_process");
  var fut = new Future;

  if (! files.inCheckout())
    throw new Error("not in checkout?");

  var execPath = path.join(files.getCurrentToolsDir(),
                           'scripts', 'admin', 'build-tools-tree.sh');
  var env = _.clone(process.env);
  env['TARGET_DIR'] = outputDir;

  // XXX in the future, for speed, might want to duplicate the logic
  // rather than shelling out to build-tools-tree.sh, so that we can
  // symlink the dev_bundle (as best we're able) and avoid copying the
  // node and mongo each time we do this. or, better yet, move all of
  // the release building scripts into javascript (make them tool
  // commands?).
  var proc = child_process.spawn(execPath, [], {
    env: env,
    stdio: 'ignore'
  });

  proc.on('exit', function (code, signal) {
    if (fut) {
      fut['return'](code === 0);
    }
  });

  proc.on('error', function (err) {
    if (fut) {
      fut['return'](false);
    }
  });

  var success = fut.wait();
  fut = null;
  if (! success)
    throw new Error("failed to run scripts/admin/build-tools.sh?");

  fs.writeFileSync(path.join(outputDir, ".tools_version.txt"),
                   version, 'utf8');

  toolBuildCache[version] = outputDir;
  return outputDir;
};


///////////////////////////////////////////////////////////////////////////////
// Run
///////////////////////////////////////////////////////////////////////////////

// Represents a test run of the tool. Typically created through the
// run() method on Sandbox.
//
// Options: args, sandbox, cwd, env
var Run = function (options) {
  var self = this;

  if (! _.has(options, 'sandbox'))
    throw new Error("don't construct this object directly");
  self.sandbox = options.sandbox;

  self.cwd = options.cwd;
  self.env = options.env;
  self._args = [];
  self.proc = null;
  self.baseTimeout = 1;
  self.extraTime = 0;

  self.stdoutMatcher = new Matcher(self);
  self.stderrMatcher = new Matcher(self);
  self.outputLog = new OutputLog(self);

  self.exitStatus = undefined; // 'null' means failed rather than exited
  self.exitFutures = [];

  self.args.apply(self, options.args || []);
};

// XXX idea is to also add options to create a project directory to
// run it inside, set up credential files that are either freshly
// created or shared..
_.extend(Run.prototype, {
  // Set command-line arguments. This may be called multiple times as
  // long as the run has not yet started (the run starts after the
  // first call to a function that requires it, like match()).
  //
  // Pass as many arguments as you want. Non-object values will be
  // cast to string, and object values will be treated as maps from
  // option names to values.
  args: function (/* arguments */) {
    var self = this;

    if (self.proc)
      throw new Error("already started?");

    _.each(_.toArray(arguments), function (a) {
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

  _exited: function (status) {
    var self = this;

    if (self.exitStatus !== undefined)
      throw new Error("already exited?");

    self.exitStatus = status;
    var exitFutures = self.exitFutures;
    self.exitFutures = null;
    _.each(exitFutures, function (f) {
      f['return']();
    });

    self.outputLog.end();
    self.stdoutMatcher.end();
    self.stderrMatcher.end();
  },

  _ensureStarted: function () {
    var self = this;

    if (self.proc)
      return;

    var execPath = null;
    if (self.sandbox.warehouse)
      execPath = path.join(self.sandbox.warehouse, 'meteor');
    else if (release.current.isCheckout())
      execPath = path.join(files.getCurrentToolsDir(), 'meteor');
    else
      execPath = path.join(files.getCurrentToolsDir(), 'bin', 'meteor');

    var env = _.clone(process.env);
    env.METEOR_SESSION_FILE = path.join(self.sandbox.root, '.meteorsession');
    if (self.sandbox.warehouse)
      env.METEOR_WAREHOUSE_DIR = self.sandbox.warehouse;
    _.extend(env, self.env);

    var child_process = require('child_process');
    self.proc = child_process.spawn(execPath, self._args, {
      cwd: self.cwd,
      env: env
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
    self.extraTime = 0;
    return self.stdoutMatcher.match(pattern, timeout, _strict);
  }),

  // As expect(), but for stderr instead of stdout.
  matchErr: markStack(function (pattern, _strict) {
    var self = this;
    self._ensureStarted();

    var timeout = self.baseTimeout + self.extraTime;
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
  forbid: markStack(function (pattern) {
    this.outputLog.forbid(pattern, 'stdout');
  }),

  // As forbid(), but for stderr instead of stdout.
  forbidErr: markStack(function (pattern) {
    this.outputLog.forbid(pattern, 'stderr');
  }),

  // Combination of forbid() and forbidErr(). Forbids the pattern on
  // both stdout and stderr.
  forbidAll: markStack(function (pattern) {
    this.outputLog.forbid(pattern);
  }),

  // Expect the program to exit without anything further being
  // printed on either stdout or stderr.
  expectEnd: markStack(function () {
    var self = this;
    self._ensureStarted();

    var timeout = self.baseTimeout + self.extraTime;
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
      self.extraTime = 0;

      var fut = new Future;
      self.exitFutures.push(fut);
      var timer = setTimeout(function () {
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
  stop: function () {
    var self = this;
    if (self.exitStatus === undefined) {
      self.proc.kill();
      self.expectExit();
    }
  }
});


///////////////////////////////////////////////////////////////////////////////
// Defining tests
///////////////////////////////////////////////////////////////////////////////

var Test = function (options) {
  var self = this;
  self.name = options.name;
  self.file = options.file;
  self.fileHash = options.fileHash;
  self.tags = options.tags || {};
  self.f = options.func;
};

var allTests = null;
var fileBeingLoaded = null;
var fileBeingLoadedHash = null;
var getAllTests = function () {
  if (allTests)
    return allTests;
  allTests = [];

  // Load all files in the 'selftests' directory that end in .js. They
  // are supposed to then call define() to register their tests.
  var testdir = path.join(__dirname, 'selftests');
  var filenames = fs.readdirSync(testdir);
  _.each(filenames, function (n) {
    if (! n.match(/^[^.].*\.js$/)) // ends in '.js', doesn't start with '.'
      return;
    try {
      if (fileBeingLoaded)
        throw new Error("called recursively?");
      fileBeingLoaded = path.basename(n, '.js');

      var fullPath = path.join(testdir, n);
      var contents = fs.readFileSync(fullPath, 'utf8');
      fileBeingLoadedHash =
        require('crypto').createHash('sha1').update(contents).digest('hex');

      require(path.join(testdir, n));
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

  var tags = {};
  _.each(tagsList, function (tag) {
    tags[tag] = true;
  });

  allTests.push(new Test({
    name: name,
    tags: tags,
    file: fileBeingLoaded,
    fileHash: fileBeingLoadedHash,
    func: f
  }));
};


///////////////////////////////////////////////////////////////////////////////
// Running tests
///////////////////////////////////////////////////////////////////////////////

var tagDescriptions = {
  checkout: 'can only run from checkouts',
  net: 'requires an internet connection'
};

// options: onlyChanged, offline, historyLines
var runTests = function (options) {
  var failureCount = 0;

  var tests = getAllTests();

  if (! tests.length) {
    process.stderr.write("No tests defined.\n");
    return 0;
  }

  var testStateFile = path.join(process.env.HOME, '.meteortest');
  var testState;
  if (fs.existsSync(testStateFile))
    testState = JSON.parse(fs.readFileSync(testStateFile, 'utf8'));
  if (! testState || testState.version !== 1)
    testState = { version: 1, lastPassedHashes: {} };
  var currentHashes = {};

  if (options.onlyChanged) {
    // Filter out tests that haven't changed since they last passed.
    tests = _.filter(tests, function (test) {
      return test.fileHash !== testState.lastPassedHashes[test.file];
    });
  }

  if (! tests.length) {
    process.stderr.write("No tests changed.\n");
    return 0;
  }

  // _.keys(skipCounts) is the set of tags to skip
  var skipCounts = {};
  if (! files.inCheckout)
    skipCounts['checkout'] = 0;

  if (options.offline)
    skipCounts['net'] = 0;

  var failuresInFile = {};
  var skipsInFile = {};
  var totalRun = 0;
  _.each(tests, function (test) {
    currentHashes[test.file] = test.fileHash;
    // Is this a test we're supposed to skip?
    var shouldSkip = false;
    _.each(_.keys(test.tags), function (tag) {
      if (_.has(skipCounts, tag)) {
        shouldSkip = true;
        skipCounts[tag] ++;
      }
    });
    if (shouldSkip) {
      skipsInFile[test.file] = true;
      return;
    }

    totalRun++;
    process.stderr.write(test.name + "... ");

    var failure = null;
    try {
      test.f();
    } catch (e) {
      if (e instanceof TestFailure) {
        failure = e;
      } else {
        process.stderr.write("exception\n\n");
        throw e;
      }
    }

    if (failure) {
      process.stderr.write("fail!\n");
      failureCount++;
      var frames = parseStack.parse(failure);
      var relpath = path.relative(files.getCurrentToolsDir(),
                                  frames[0].file);
      process.stderr.write("  => " + failure.reason + " at " +
                           relpath + ":" + frames[0].line + "\n");
      if (failure.reason === 'no-match') {
      }
      if (failure.reason === "wrong-exit-code") {
        var s = function (status) {
          return status.signal || ('' + status.code) || "???";
        };

        process.stderr.write("  => Expected: " + s(failure.details.expected) +
                             "; actual: " + s(failure.details.actual) + "\n");
      }

      if (failure.details.run) {
        var lines = failure.details.run.outputLog.get();
        if (! lines.length) {
          process.stderr.write("  => No output\n");
        } else {
          var historyLines = options.historyLines || 10;

          process.stderr.write("  => Last " + historyLines + " lines:\n");
          _.each(lines.slice(-historyLines), function (line) {
            process.stderr.write("  " +
                                 (line.channel === "stderr" ? "2| " : "1| ") +
                                 line.text +
                                 (line.bare ? "%" : "") + "\n");
          });
        }
      }

      if (failure.details.messages) {
        process.stderr.write("  => Errors while building:\n");
        process.stderr.write(failure.details.messages.formatMessages());
      }

      failuresInFile[test.file] = true;
    } else {
      process.stderr.write("ok\n");
    }
  });

  _.each(_.keys(currentHashes), function (f) {
    if (! failuresInFile[f] && ! skipsInFile[f]) {
      testState.lastPassedHashes[f] = currentHashes[f];
    }
  });

  fs.writeFileSync(testStateFile, JSON.stringify(testState), 'utf8');

  if (totalRun > 0)
    process.stderr.write("\n");

  var totalSkipCount = 0;
  _.each(skipCounts, function (count, tag) {
    totalSkipCount += count;
    if (count) {
      process.stderr.write("Skipped " + count + " '" + tag + "' test" +
                           (count > 1 ? "s" : "") + " (" +
                           tagDescriptions[tag] + ")\n");
    }
  });

  if (failureCount === 0) {
    var disclaimers = '';
    if (totalSkipCount > 0)
      disclaimers += " other";
    if (options.onlyChanged)
      disclaimers += " changed";
    process.stderr.write("All" + disclaimers + " tests passed.\n");
    return 0;
  } else {
    process.stderr.write(failureCount + " failure" +
                         (failureCount > 1 ? "s" : "") + ".\n");
    return 1;
  }
};

// To create self-tests:
//
// Create a new .js file in the selftests directory. It will be picked
// up automatically.
//
// Start your file with something like:
//   var selftest = require('../selftest.js');
//   var Sandbox = selftest.Sandbox;
//
// Define tests with:
//   selftest.define("test-name", ['tag1', 'tag2'], function () {
//     ...
//   });
//
// The tags are used to group tests. Currently used tags:
//   'checkout': should only be run when we're running from a checkout
//   as opposed to a released copy.
//   'net': test requires an internet connection. Not going to work if
//   you're on a plane and should be skipped by 'self-test --offline'.
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
  define: define,
  Sandbox: Sandbox
});



// XXX have the self-test command take a --universe option (to set the
// universe used in the spawned copy of meteor). if you don't set one
// you don't get the tests that talk to servers.

// XXX have a way to fake being offline
