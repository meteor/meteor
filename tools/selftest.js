var _ = require('underscore');
var path = require('path');
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

var Matcher = function () {
  var self = this;
  self.buf = "";
  self.ended = false;
  self.matchPattern = null;
  self.matchFuture = null;
  self.matchStrict = null;
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
        f['throw'](new TestFailure('match-timeout'));
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

    if (self.buf.length > 0)
      throw new TestFailure('junk-at-end');
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
        if (self.matchStrict && m.index !== 0)
          f['throw'](new TestFailure('junk-before'));
        ret = m;
        self.buf = self.buf.slice(m.index + m[0].length);
      }
    } else {
      var i = self.buf.indexOf(self.matchPattern);
      if (i !== -1) {
        if (self.matchStrict && i !== 0)
          f['throw'](new TestFailure('junk-before'));
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
      f['throw'](new TestFailure('no-match'));
      return;
    }
  }
});

// Represents a test run of the tool.
//
// Argument passed to the Run constructor will be passed to args().
var Run = function () {
  var self = this;
  self._args = [];
  self.proc = null;
  self.baseTimeout = 1;
  self.extraTime = 0;

  self.stdoutMatcher = new Matcher;
  self.stderrMatcher = new Matcher;

  self.exitStatus = undefined; // 'null' means failed rather than exited
  self.exitFutures = [];

  self.args.apply(self, arguments);
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

    self.stdoutMatcher.end();
    self.stderrMatcher.end();
  },

  _ensureStarted: function () {
    var self = this;

    if (self.proc)
      return;

    var execPath = null;
    if (release.current.isCheckout())
      execPath = path.join(files.getCurrentToolsDir(), 'meteor');
    else
      execPath = path.join(files.getCurrentToolsDir(), 'bin', 'meteor');

    var child_process = require('child_process');
    // XXX should probably clean out environment?
    self.proc = child_process.spawn(execPath, self._args);

    self.proc.on('close', function (code, signal) {
      if (self.exitStatus === undefined)
        self._exited({ code: code, signal: signal });
    });

    self.proc.on('close', function (code, signal) {
      if (self.exitStatus === undefined)
        self._exited(null);
    });

    self.proc.stdout.setEncoding('utf8');
    self.proc.stdout.on('data', function (data) {
      self.stdoutMatcher.write(data);
    });

    self.proc.stderr.setEncoding('utf8');
    self.proc.stderr.on('data', function (data) {
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
  // the process does not exit after a timeout.
  expectExit: markStack(function (code) {
    var self = this;
    self._ensureStarted();

    if (self.exitStatus === undefined) {
      var timeout = self.baseTimeout + self.extraTime;
      self.extraTime = 0;

      var fut = new Future;
      self.exitFutures.push(fut);
      var timer = setTimeout(function () {
        fut['throw'](new TestFailure('exit-timeout'));
      }, timeout * 1000);

      try {
        fut.wait();
      } finally {
        clearTimeout(timer);
      }
    }

    if (! self.exitStatus)
      throw new TestFailure('spawn-failure');
    if (code !== undefined && self.exitStatus.code !== code) {
      throw new TestFailure('wrong-exit-code', {
        expected: { code: code },
        actual: self.exitStatus
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
  }
});

var Test = function (name, f) {
  var self = this;
  self.name = name;
  self.f = f;
};

var allTests = [];
var defineTest = function (name, f) {
  allTests.push(new Test(name, f));
};

// XXX idea is that options will eventually include server to test
// against, user account(s) to use for deploys.. maybe read out of a
// config file
//
// XXX idea is that test suites will live in a tests subdirectory and
// be included from here, and require us back to get the machinery
var runTests = function () {
  var failureCount = 0;

  _.each(allTests, function (test) {
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
    } else {
      process.stderr.write("ok\n");
    }
  });

  if (failureCount === 0) {
    process.stderr.write("\nAll tests passed.\n");
    return 0;
  } else {
    process.stderr.write("\n" + failureCount + " failure" +
                         (failureCount > 1 ? "s" : "") + ".\n");
    return 1;
  }
};


/*
defineTest("is fluffy", function () {
});

defineTest("can fly a plane", function () {
  throw new TestFailure;
});

defineTest("is the cutest most adorable kitten", function () {
});
*/

defineTest("help", function () {
  var run = new Run("help");
  run.match("Usage: meteor");
  run.match("Commands:");
  run.match(/create\s*Create a new project/);
  run.expectExit(0);

  // XXX test --help, help for particular commands
});

defineTest("argument parsing", function () {
  // XXX test that main.js catches all the weird error cases
});

defineTest("login", function () {
  // XXX need to create a new credentials file for this run! (and a
  // user account)
  // XXX how to clean up test user accounts at end of test run? or,
  // only ever do it against a testing universe, and don't bother?
  var run = new Run("whoami");
  run.matchErr("Not logged in");
  run.expectExit(1);

  var run = new Run("login");
  run.match("Username:");
  run.write("test\n");
  run.match("Password:");
  run.write("testtest\n");
  run.waitSecs(5);
  run.match("Logged in as test.");
  run.expectExit(0);

  // XXX test login failure
  // XXX test login by email

  var run = new Run("whoami");
  // XXX want something like 'matchAll' that you call after expectExit
  // and must match all remaining input. basically, it's like match
  // except that it requires the match offset to be zero. if you call
  // that after exit it will do what we want.
  run.read("test\n");
  run.expectEnd();
  run.expectExit(0);

  var run = new Run("logout");
  run.wait(5);
  run.matchErr("Logged out");
  run.expectExit(0);

  var run = new Run("logout");
  run.matchErr("Not logged in");
  run.expectExit(0);

  var run = new Run("whoami");
  run.matchErr("Not logged in");
  run.expectExit(1);
});


// XXX tests are slow, so we're going to need a good mechanism for
// running particular tests, or previously failing tests, or changed
// tests (!) or something.. OR, have a fast mode (the default unless
// you pass --paranoid) that just reruns main() in-process, rather
// than spawning?? stdio becomes a bit of a mess..

// XXX way of marking tests that need network, so that we can skip
// them when testing on an airplane (well, universe..)

// XXX have the self-test command take a --universe option (to set the
// universe used in the spawned copy of meteor). if you don't set one
// you don't get the tests that talk to servers.

// XXX have a way to fake being offline

// XXX how are we going to test updating and springboarding? it would
// be great if you could do this from a checkout without having to cut
// a release

exports.runTests = runTests;
