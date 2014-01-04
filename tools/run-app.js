var fs = require("fs");
var path = require("path");
var _ = require('underscore');
var Future = require('fibers/future');
var Fiber = require('fibers');
var files = require('./files.js');
var watch = require('./watch.js');
var project = require('./project.js');
var bundler = require('./bundler.js');
var release = require('./release.js');
var inFiber = require('./fiber-helpers.js').inFiber;

// Parse out s as if it were a bash command line.
var bashParse = function (s) {
  if (s.search("\"") !== -1 || s.search("'") !== -1) {
    throw new Error("Meteor cannot currently handle quoted NODE_OPTIONS");
  }
  return _.without(s.split(/\s+/), '');
};

var getNodeOptionsFromEnvironment = function () {
  return bashParse(process.env.NODE_OPTIONS || "");
};

///////////////////////////////////////////////////////////////////////////////
// AppProcess
///////////////////////////////////////////////////////////////////////////////

// Given a bundle, run a program in the bundle. Report when it dies.
//
// Call start() to start the process. You will then eventually receive
// a call to onExit(code, signal): code is the numeric exit code of a
// normal exit, signal is the string signal name if killed, and if
// both are undefined it means something went wrong in invoking the
// program and it was logged.
//
// If the app successfully starts up, you will also receive onListen()
// once the app says it's ready to receive connections.
//
// Call stop() at any time after start() returns to terminate the
// process if it is running. You will get an onExit callback if this
// resulted in the process dying. stop() is idempotent.
//
// Required options: bundlePath, port, rootUrl, mongoUrl, oplogUrl, runLog
// Optional options: onExit, onListen, program, nodeOptions, settings

var AppProcess = function (options) {
  var self = this;

  self.bundlePath = options.bundlePath;
  self.port = options.port;
  self.rootUrl = options.rootUrl;
  self.oplogUrl = option.oplogUrl;
  self.runLog = options.runLog;

  self.onExit = options.onExit;
  self.onListen = options.onListen;
  self.program = options.program || null;
  self.nodeOptions = options.nodeOptions || [];
  self.settings = options.settings;

  self.proc = null;
  self.keepaliveTimer = null;
  self.madeExitCallback = false;
};

_.extend(AppProcess.prototype, {
  // Call to start the process.
  start: function () {
    var self = this;

    if (self.proc)
      throw new Error("already started?");

    // Start the app!
    self.proc = self._spawn();

    if (self.proc === null) {
      self.runLog.log("Program '" + self.program + "' not found.");

      if (! self.madeExitCallback)
        self.onExit && self.onExit();
      self.madeExitCallback = true;
    }

    // Send stdout and stderr to the runLog
    var eachline = require('eachline');
    eachline(self.proc.stdout, 'utf8', function (line) {
      if (line.match(/^LISTENING\s*$/)) {
        // This is the child process telling us that it's ready to
        // receive connections.
        self.onListen && self.onListen();
      } else {
        self.runLog.logAppOutput(line);
      }
    });

    eachline(self.proc.stderr, 'utf8', function (line) {
      self.runLog.logAppOutput(line, true);
    });

    // Watch for exit
    proc.on('close', function (code, signal) {
      if (signal) {
        self.runLog.log('=> Exited from signal: ' + signal);
      } else {
        self.runLog.log('=> Exited with code: ' + code);
      }

      if (! self.madeExitCallback)
        self.onExit && self.onExit(code, signal);
      self.madeExitCallback = true;
    });

    proc.on('error', function (err) {
      self.runLog.log("=> Couldn't spawn process: " + err.message);

      // node docs say that it might make both an 'error' and a
      // 'close' callback, so we use a guard to make sure we only call
      // onExit once.
      if (! self.madeExitCallback)
        self.onExit && self.onExit();
      self.madeExitCallback = true;
    };

    // This happens sometimes when we write a keepalive after the app
    // is dead. If we don't register a handler, we get a top level
    // exception and the whole app dies.
    // http://stackoverflow.com/questions/2893458/uncatchable-errors-in-node-js
    proc.stdin.on('error', function () {});

    // Keepalive so child process can detect when we die
    self.keepaliveTimer = setInterval(function () {
      try {
        if (self.proc && self.proc.pid &&
            self.proc.stdin && self.proc.stdin.write)
          self.proc.stdin.write('k');
      } catch (e) {
        // do nothing. this fails when the process dies.
      }
    }, 2000);
  },

  // Idempotent
  stop: function () {
    var self = this;

    if (self.proc && self.proc.pid) {
      self.proc.removeAllListeners('close');
      self.proc.kill();
    }
    self.proc = null;

    if (self.keepaliveTimer)
      clearInterval(self.keepaliveTimer);
    self.keepaliveTimer = null;
  },

  _computeEnvironment: function () {
    var self = this;
    var env = _.extend({}, process.env);

    env.PORT = self.port;
    env.ROOT_URL = self.rootUrl;
    env.MONGO_URL = self.mongoUrl;
    if (self.oplogUrl)
      env.MONGO_OPLOG_URL = self.oplogUrl;
    if (self.settings)
      env.METEOR_SETTINGS = self.settings;
    else
      delete env.METEOR_SETTINGS;

    // Display errors from (eg) the NPM connect module over the network.
    env.NODE_ENV = 'development';

    return env;
  },

  // Spawn the server process and return the handle from
  // child_process.spawn, or return null if the requested program
  // wasn't found in the bundle.
  _spawn: function () {
    var self = this;

    var child_process = require('child_process');

    if (! self.program) {
      // Old-style bundle
      var opts = _.clone(self.nodeOptions);
      opts.push(path.join(self.bundlePath, 'main.js'));
      opts.push('--keepalive');

      return child_process.spawn(process.execPath, opts, {
        env: self._computeEnvironment()
      });
    } else {
      // Star. Read the metadata to find the path to the program to run.
      var starJson = JSON.parse(
        fs.readFileSync(path.join(self.bundlePath, 'star.json'), 'utf8'));

      var archinfo = require('./archinfo.js');
      var programPath = null;
      _.each(starJson.programs, function (p) {
        // XXX should actually use archinfo.mostSpecificMatch instead of
        // taking the first match
        if (p.name !== self.program)
          return;
        if (! archinfo.matches(archinfo.host(), p.arch))
          return; // can't run here
        programPath = path.join(options.bundlePath, p.path);
      });

      if (! programPath)
        return null;

      return child_process.spawn(programPath, [], {
        env: self._computeEnvironment()
      });
    }
  }
});

///////////////////////////////////////////////////////////////////////////////
// AppRunner
///////////////////////////////////////////////////////////////////////////////

// Given an app, bundle and run the app. Communicates with a Proxy to
// tell it when the app is up.
//
// Can run in two modes. In the first, you call start() and AppRunner
// works interactively in the background, restarting the process when
// it dies, and waits for a file change if it crashes repeatedly or
// fails to bundle. It prints status and error messages as it
// goes. Call stop() to shut it down.
//
// In the other mode, you call runOnce() and the app is bundled and
// run exactly once, and runOnce() returns the app's exit code.
//
// options: appDir, appDirForVersionCheck (defaults to appDir), port,
// buildOptions, rootUrl, settingsFile, program, proxy, runLog
var AppRunner = function (options) {
  var self = this;

  self.appDir = options.appDir;
  self.appDirForVersionCheck = options.appDirForVersionCheck || self.appDir;
  self.port = options.port;
  self.buildOptions = options.buildOptions;
  self.rootUrl = options.rootUrl;
  self.settingsFile = options.settingsFile;
  self.program = options.program;
  self.proxy = options.proxy;
  self.runLog = options.runLog;

  self.started = false;
  self.runFuture = null;
  self.exitFuture = null;
};

_.extend(AppRunner.prototype, {
  // Start the app running, and restart it as necessary. Returns
  // immediately.
  //
  // onFailure (optional) is a callback to call if there is a
  // permanent failure of some sort, of the kind that can't be fixed
  // by the source files changing.
  start: function (onFailure) {
    var self = this;

    if (self.started)
      throw new Error("already started?");
    self.started = true;

    new Fiber(function () {
      self._fiber(onFailure);
    }).run();
  },

  // Shut down the app. stop() will block until the app is shut
  // down. This may involve waiting for bundling to
  // finish. Idempotent, however only one thread may be in stop() at a
  // time.
  stop: function () {
    var self = this;

    if (! self.started)
      return; // nothing to do

    if (self.exitFuture)
      throw new Error("another fiber already stopping?");

    self.exitFuture = new Future;
    if (self.runFuture)
      self.runFuture['return']({ outcome: 'stopped' });

    self.exitFuture.wait();
    self.exitFuture = null;
    self.started = false;
  },

  // Run the program once, wait for it to exit, and then return. If
  // exitOnChange is true (the default is false), then watch the
  // program's source files for changes, and if any of them change
  // then kill the program and return. If onListen is provided, it is
  // called when the app has started and is listening for connections.
  //
  // Doesn't print anything.
  //
  // Returns an object with a key 'outcome' which will have one of the
  // following values:
  //
  // - 'terminated': the process exited. Either the 'code' or 'signal'
  //   attribute will also be set.
  //
  // - 'bundle-fail': bundling failed. The 'bundleResult' attribute
  //
  // - 'changed': exitOnChange was set and a source file changed.
  //
  // - 'wrong-release': the release that this app targets does not
  //   match the currently running version of Meteor (eg, the user
  //   typed 'meteor update' in another window).
  //
  // - 'stopped': stop() was called (you will not see this if you call
  //   runOnce directly, since stop() works only with start())
  //
  // Additionally, for 'terminated', 'bundle-fail', and 'changed',
  // 'bundleResult' will will have the return value from
  // bundler.bundle(), which contains build errors (in the case of
  // 'bundle-fail') and the files to monitor for changes that should
  // trigger a rebuild.
  runOnce: function (exitOnChange, onListen) {
    var self = this;

    self.runLog.clearLog();

    // Check to make sure we're running the right version of Meteor.
    //
    // We let you override appDir and use a different directory for
    // this check for the benefit of 'meteor test-packages', which
    // generates a test harness app on the fly (and sets it release to
    // release.current), but we still want to detect the mismatch if
    // you are testing packages from an app and you 'meteor update'
    // that app.
    if (self.appDirForVersionCheck &&
        ! release.usingRightReleaseForApp(self.appDirForVersionCheck)) {
      return { outcome: 'wrong-release' };
    }

    // Bundle up the app
    if (! self.firstRun)
      release.current.library.refresh(true); // pick up changes to packages

    self.proxy.setMode("hold");
    var bundlePath = path.join(self.appDir, '.meteor', 'local', 'build');

    var bundleResult = bundler.bundle({
      appDir: self.appDir,
      outputPath: bundlePath,
      nodeModulesMode: "symlink",
      buildOptions: self.buildOptions
    });

    if (bundleResult.errors)
      return {
        outcome: 'bundle-fail',
        bundleResult: bundleResult
      };
    var watchSet = bundleResult.watchSet;

    // Read the settings file, if any
    var settings = null;
    if (self.settingsFile)
      settings = files.getSettings(self.settingsFile, watchSet);

    // Atomically (1) see if we've been stop()'d, (2) if not, create a
    // future that can be used to stop() us once we start running.
    if (self.exitFuture)
      return { outcome: 'stopped' };
    if (self.runFuture)
      throw new Error("already have future?");
    self.runFuture = new Future;

    // Run the program
    var appProcess = new AppProcess({
      bundlePath: bundlePath,
      port: self.appPort,
      rootUrl: self.rootUrl,
      mongoUrl: self.mongoUrl,
      oplogUrl: self.oplogUrl,
      runLog: self.runLog,
      onExit: function (code, signal) {
        self.runFuture['return']({
          outcome: 'terminated',
          code: code,
          signal: signal,
          bundleResult: bundleResult
        });
      },
      program: self.program,
      onListen: function () {
        self.proxy.setMode("proxy");
        if (onListen)
          onListen();
      },
      nodeOptions: getNodeOptionsFromEnvironment(),
      settings: settings
    });
    appProcess.start();

    // Start watching for changes for files if requested. There's no
    // hurry to do this, since watchSet contains a snapshot of the
    // state of the world at the time of bundling, in the form of
    // hashes and lists of matching files in each directory.
    var watcher;
    if (exitOnChange) {
      watcher = new watch.Watcher({
        watchSet: watchSet,
        onChange: function () {
          self.runFuture['return']({
            outcome: 'changed',
            bundleResult: bundleResult
          });
        }
      });
    }

    // Wait for either the process to exit, or (if exitOnChange) a
    // source file to change. Or, for stop() to be called.
    var ret = self.runFuture.wait();
    self.runFuture = null;

    self.proxy.setMode("hold");
    appProcess.stop();
    if (watcher)
      watcher.stop();

    return ret;
  },

  _fiber: function (onFailure) {
    var self = this;

    var waitForChanges = function (watchSet) {
      var fut = new Future;
      var watcher = new watch.Watcher({
        watchSet: watchSet,
        onChange: function () { fut['return'](); }
      });
      fut.wait();
    };

    var crashCount = 0;
    var crashTimer = null;
    var firstRun = true;

    while (true) {
      if (self.exitFuture) {
        // Asked to exit by stop()
        self.exitFuture['return']();
        break;
      }

      var runResult = self.runOnce(true, function () {
        if (firstRun) {
          self.runLog.log("=> Meteor server running on: " + self.rootUrl +"\n");
          firstRun = false;
        } else {
          self.runLog.logRestart();
        }
      });

      if (crashTimer) {
        clearTimeout(crashTimer);
        crashTimer = null;
      }
      if (runResult.outcome !== "terminated")
        crashCount = 0;

      // If the user did not specify a --release on the command line,
      // and simultaneously runs `meteor update` during this run, just
      // exit and let them restart the run. (We can do something fancy
      // like allowing this to work if the tools version didn't
      // change, or even springboarding if the tools version does
      // change, but this (which prevents weird errors) is a start.)
      if (runResult.outcome === "wrong-release") {
        var to = project.getMeteorReleaseVersion(self.appDirForVersionCheck);
        var from = release.current.name;
        self.runLog.log(
"Your app has been updated to Meteor " + to + " from " + "Meteor " + from +
".\n" +
"Restart meteor to use the new release.");
        onFailure && onFailure();
        if (self.exitFuture)
          self.exitFuture['return']();
        else
          self.started = false;
        break;
      }

      if (runResult.outcome === "bundle-fail") {
        self.runLog.log("=> Errors prevented startup:\n\n" +
                        runResult.bundleResult.errors.formatMessages());
        self.runLog.log("=> Your application has errors. " +
                        "Waiting for file change.");
        self.proxy.setMode("errorpage");
        waitForChanges(runResult.bundleResult.watchSet);
        self.runLog.log("=> Modified -- restarting.");
        continue;
      }

      if (runResult.outcome === "changed" ||
          runResult.outcome === "stopped")
        continue;
      }

      if (runResult.outcome === "terminated") {
        crashCount ++;
        crashTimer = setTimeout(function () {
          crashCount = 0;
        }, 2000);

        if (crashCount > 2) {
          self.proxy.setMode("errorpage");
          self.runLog.log("=> Your application is crashing. " +
                          "Waiting for file change.");
          waitForChanges(runResult.bundleResult.watchSet);
          self.runLog.log("=> Modified -- restarting.");
        }

        continue;
      }

      throw new Error("unknown run outcome?");
    }
  }
});

///////////////////////////////////////////////////////////////////////////////

exports.AppRunner = AppRunner;
