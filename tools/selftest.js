var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var files = require('./files.js');
var utils = require('./utils.js');
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

var Sandbox = function (options) {
  var self = this;
  options = options || {};
  self.root = files.mkdtemp();
  self.warehouse = null;

  self.home = path.join(self.root, 'home');
  fs.mkdirSync(self.home, 0755);
  self.cwd = self.home;
  self.env = {};
  self.fakeMongo = options.fakeMongo;

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

  // Figure out the 'meteor' to run
  if (self.warehouse)
    self.execPath = path.join(self.warehouse, 'meteor');
  else if (release.current.isCheckout())
    self.execPath = path.join(files.getCurrentToolsDir(), 'meteor');
  else
    self.execPath = path.join(files.getCurrentToolsDir(), 'bin', 'meteor');
};

_.extend(Sandbox.prototype, {
  // Create a new test run of the tool in this sandbox.
  run: function (/* arguments */) {
    var self = this;

    var env = _.clone(self.env);
    env.METEOR_SESSION_FILE = path.join(self.root, '.meteorsession');
    if (self.warehouse)
      env.METEOR_WAREHOUSE_DIR = self.warehouse;
    // By default (ie, with no mock warehouse and no --release arg) we should be
    // testing the actual release this is built in, so we pretend that it is the
    // latest release.
    if (!self.warehouse && release.current.isProperRelease())
      env.METEOR_TEST_LATEST_RELEASE = release.current.name;

    return new Run(self.execPath, {
      sandbox: self,
      args: _.toArray(arguments),
      cwd: self.cwd,
      env: env,
      fakeMongo: self.fakeMongo
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
  createApp: function (to, template) {
    var self = this;
    files.cp_r(path.join(__dirname, 'tests', 'apps', template),
               path.join(self.cwd, to));
    // If the test isn't explicitly managing a mock warehouse, ensure that apps
    // run with our release by default.
    if (!self.warehouse && release.current.isProperRelease()) {
      self.write(path.join(to, '.meteor/release'), release.current.name);
    }
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
    self.cwd = path.resolve(self.cwd, relativePath);
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
    fs.writeFileSync(path.join(self.cwd, filename), contents, 'utf8');
  },

  // Reads a file in the sandbox as a utf8 string. 'filename' is a path
  // intepreted relative to the Sandbox's cwd.  throws if the file does not
  // exist.
  // XXX maybe it should return null if the file does not exist?
  read: function (filename) {
    var self = this;
    return fs.readFileSync(path.join(self.cwd, filename), 'utf8');
  },

  // Delete a file in the sandbox. 'filename' is as in write().
  unlink: function (filename) {
    var self = this;
    fs.unlinkSync(path.join(self.cwd, filename));
  },

  // Return the current contents of .meteorsession in the sandbox.
  readSessionFile: function () {
    var self = this;
    return fs.readFileSync(path.join(self.root, '.meteorsession'), 'utf8');
  },

  // Overwrite .meteorsession in the sandbox with 'contents'. You
  // could use this in conjunction with readSessionFile to save and
  // restore authentication states.
  writeSessionFile: function (contents) {
    var self = this;
    return fs.writeFileSync(path.join(self.root, '.meteorsession'),
                            contents, 'utf8');
  }
});


// Build a tools release into a temporary directory (based on the
// current checkout), and gives it a version name of
// 'version'. Returns the directory.
//
// This is memoized for speed (multiple calls with the same version
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
// run() method on Sandbox, but can also be created directly, say if
// you want to do something other than invoke the 'meteor' command in
// a nice sandbox.
//
// Options: args, cwd, env
var Run = function (execPath, options) {
  var self = this;

  self.execPath = execPath;
  self.cwd = options.cwd || process.cwd();
  self.env = options.env || {};
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

  self.fakeMongoPort = null;
  self.fakeMongoConnection = null;
  if (options.fakeMongo) {
    self.fakeMongoPort = require('./utils.js').randomPort();
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

    self.stdoutMatcher.end();
    self.stderrMatcher.end();
  },

  _ensureStarted: function () {
    var self = this;

    if (self.proc)
      return;

    var env = _.clone(process.env);
    _.extend(env, self.env);

    var child_process = require('child_process');
    self.proc = child_process.spawn(self.execPath, self._args, {
      cwd: self.cwd,
      env: env
    });

    self.proc.on('close', function (code, signal) {
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
      self.proc.kill();
      self.expectExit();
    }
  }),

  // Like stop, but doesn't wait for it to exit.
  _stopWithoutWaiting: function () {
    var self = this;
    if (self.exitStatus === undefined) {
      self.proc.kill();
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
    // open a connection to fake-mongod. Wait up to 2 seconds for it
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
      for (var attempts = 0; ! self.fakeMongoConnection && attempts < 50;
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
  self.tags = options.tags || {};
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
  var testdir = path.join(__dirname, 'tests');
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
  net: 'require an internet connection',
  slow: 'take quite a long time',
  // these last two are not actually test tags; they reflect the use of
  // --changed and --tests
  unchanged: 'unchanged since last pass',
  'non-matching': "don't match specified pattern"
};

// options: onlyChanged, offline, includeSlowTests, historyLines, testRegexp
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

  // _.keys(skipCounts) is the set of tags to skip
  var skipCounts = {};
  if (! files.inCheckout())
    skipCounts['checkout'] = 0;

  if (options.offline)
    skipCounts['net'] = 0;

  if (! options.includeSlowTests)
    skipCounts['slow'] = 0;

  if (options.testRegexp) {
    var lengthBeforeTestRegexp = tests.length;
    // Filter out tests whose name doesn't match.
    tests = _.filter(tests, function (test) {
      return options.testRegexp.test(test.name);
    });
    skipCounts['non-matching'] = lengthBeforeTestRegexp - tests.length;
  }

  if (options.onlyChanged) {
    var lengthBeforeOnlyChanged = tests.length;
    // Filter out tests that haven't changed since they last passed.
    tests = _.filter(tests, function (test) {
      return test.fileHash !== testState.lastPassedHashes[test.file];
    });
    skipCounts.unchanged = lengthBeforeOnlyChanged - tests.length;
  }

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
      runningTest = test;
      test.f();
    } catch (e) {
      if (e instanceof TestFailure) {
        failure = e;
      } else {
        process.stderr.write("exception\n\n");
        throw e;
      }
    } finally {
      runningTest = null;
      test.cleanup();
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
        failure.details.run.outputLog.end();
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
    if (failuresInFile[f])
      delete testState.lastPassedHashes[f];
    else if (! skipsInFile[f])
      testState.lastPassedHashes[f] = currentHashes[f];
  });

  if (tests.length)
    fs.writeFileSync(testStateFile, JSON.stringify(testState), 'utf8');

  if (totalRun > 0)
    process.stderr.write("\n");

  var totalSkipCount = 0;
  _.each(skipCounts, function (count, tag) {
    totalSkipCount += count;
    if (count) {
      process.stderr.write("Skipped " + count + " " + tag + " test" +
                           (count > 1 ? "s" : "") + " (" +
                           tagDescriptions[tag] + ")\n");
    }
  });

  if (tests.length === 0) {
    process.stderr.write("No tests run.\n");
    return 0;
  } else if (failureCount === 0) {
    var disclaimers = '';
    if (totalSkipCount > 0)
      disclaimers += " other";
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
// Create a new .js file in the tests directory. It will be picked
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
  markStack: markStack,
  define: define,
  Sandbox: Sandbox,
  Run: Run
});
