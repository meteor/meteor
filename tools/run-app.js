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
var buildmessage = require('./buildmessage.js');
var inFiber = require('./fiber-helpers.js').inFiber;
var runLog = require('./run-log.js').runLog;

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
// Required options: bundlePath, port, rootUrl, mongoUrl, oplogUrl
// Optional options: onExit, onListen, program, nodeOptions, settings

var AppProcess = function (options) {
  var self = this;

  self.bundlePath = options.bundlePath;
  self.port = options.port;
  self.rootUrl = options.rootUrl;
  self.mongoUrl = options.mongoUrl;
  self.oplogUrl = options.oplogUrl;

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
      runLog.log("Program '" + self.program + "' not found.");

      self._maybeCallOnExit();
      return;
    }

    // Send stdout and stderr to the runLog
    var eachline = require('eachline');
    eachline(self.proc.stdout, 'utf8', function (line) {
      if (line.match(/^LISTENING\s*$/)) {
        // This is the child process telling us that it's ready to
        // receive connections.
        self.onListen && self.onListen();
      } else {
        runLog.logAppOutput(line);
      }
    });

    eachline(self.proc.stderr, 'utf8', function (line) {
      runLog.logAppOutput(line, true);
    });

    // Watch for exit and for stdio to be fully closed (so that we don't miss
    // log lines).
    self.proc.on('close', function (code, signal) {
      self._maybeCallOnExit(code, signal);
    });

    self.proc.on('error', function (err) {
      runLog.log("=> Couldn't spawn process: " + err.message);

      // node docs say that it might make both an 'error' and a
      // 'close' callback, so we use a guard to make sure we only call
      // onExit once.
      self._maybeCallOnExit();
    });

    // This happens sometimes when we write a keepalive after the app
    // is dead. If we don't register a handler, we get a top level
    // exception and the whole app dies.
    // http://stackoverflow.com/questions/2893458/uncatchable-errors-in-node-js
    self.proc.stdin.on('error', function () {});

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

  _maybeCallOnExit: function (code, signal) {
    var self = this;
    if (self.madeExitCallback)
      return;
    self.madeExitCallback = true;
    self.onExit && self.onExit(code, signal);
  },

  // Idempotent. Once stop() returns it is guaranteed that you will
  // receive no more callbacks from this AppProcess.
  stop: function () {
    var self = this;

    if (self.proc && self.proc.pid) {
      self.proc.removeAllListeners('close');
      self.proc.removeAllListeners('error');
      self.proc.kill();
    }
    self.proc = null;

    if (self.keepaliveTimer)
      clearInterval(self.keepaliveTimer);
    self.keepaliveTimer = null;

    self.onListen = null;
    self.onExit = null;
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
    // We run the server behind our own proxy, so we need to increment
    // the HTTP forwarded count.
    env.HTTP_FORWARDED_COUNT =
      "" + ((parseInt(process.env['HTTP_FORWARDED_COUNT']) || 0) + 1);

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
        programPath = path.join(self.bundlePath, p.path);
      });

      if (! programPath)
        return null;

      return child_process.spawn(programPath, [], {
        env: _.extend(self._computeEnvironment(), {
          DATA_DIR: files.mkdtemp()
        })
      });
    }
  }
});

///////////////////////////////////////////////////////////////////////////////
// AppRunner
///////////////////////////////////////////////////////////////////////////////

// Given an app, bundle and run the app. If the app's source changes,
// kill, rebundle, and rerun it. If the app dies, restart it, unless
// it dies repeatly immediately after being started, in which case
// wait for source changes to restart.
//
// Communicates with a Proxy to tell it when the app is up,
// temporarily down, or crashing.
//
// Options include:
//
// - onRunEnd(result): If provided, called after each run of the program (or
//   attempted run, if, say, bundling fails). Blocks restarting until it
//   returns. See below for the format of 'result'. Return truthy to continue;
//   return falsey to give up (without logging any more status messages). Do not
//   call stop() from onRunEnd as that would necessarily deadlock.
//
// - watchForChanges: If true, the default, then (a) the program will
//   be killed and restarted if its source files change; (b) if
//   something goes really wrong (bundling fails, the program crashes
//   constantly) such that we give up, we will start trying again if
//   the source files change. If false, then we don't do (a) and if
//   (b) happens we just give up permanently.
//
// - noRestartBanner: Set to true to skip the banner that is normally
//   printed after each restart of the app once it is ready to listen
//   for connections.
//
// - Other options: appDirForVersionCheck (defaults to appDir), port,
//   mongoUrl, oplogUrl, buildOptions, rootUrl, settingsFile, program,
//   proxy
//
// To use, construct an instance of AppRunner, and then call start()
// to start it running. Call stop() at any time to shut it down and
// clean it up. You should call stop() to clean up even if you return
// false from onRunEnd(); this stops the restarting but doesn't
// destroy the AppRunner instance.
//
// The 'result' argument to onRunEnd is an object with keys:
//
// - outcome: the reason the run ended. One of:
//
//   - 'terminated': the process exited. Additionally, a 'code'
//     attribute will be set of the process exited on its own accord,
//     a 'signal' attribute will be set if the process was killed on a
//     signal, or neither will be set if the process could not be
//     spawned (spawn call failed, or no such program in bundle) -- in
//     this last case an explanation will have been written to the run
//     log, and you may assume that it will take more than source code
//     changes to fix the problem.
//
//   - 'bundle-fail': bundling failed.
//
//   - 'changed': watchForChanges was true and a source file changed.
//
//   - 'wrong-release': the release that this app targets does not
//     match the currently running version of Meteor (eg, the user
//     typed 'meteor update' in another window). An 'releaseNeeded'
//     attribute will be present giving the app's release name.
//
//   - 'stopped': stop() was called while a run was in progress.
//
// - bundleResult: for runs in which bundling happened (all except
//   'wrong-release' and possibly 'stopped'), the return value from
//   bundler.bundle(), which contains such interesting things as the
//   build errors and a watchset describing the source files of the
//   app.
var AppRunner = function (appDir, options) {
  var self = this;

  self.appDir = appDir;
  self.appDirForVersionCheck = options.appDirForVersionCheck || self.appDir;
  // note: run-all.js updates port directly
  self.port = options.port;
  self.mongoUrl = options.mongoUrl;
  self.oplogUrl = options.oplogUrl;
  self.buildOptions = options.buildOptions;
  self.rootUrl = options.rootUrl;
  self.settingsFile = options.settingsFile;
  self.program = options.program;
  self.proxy = options.proxy;
  self.watchForChanges =
    options.watchForChanges === undefined ? true : options.watchForChanges;
  self.onRunEnd = options.onRunEnd;
  self.noRestartBanner = options.noRestartBanner;

  self.fiber = null;
  self.startFuture = null;
  self.runFuture = null;
  self.exitFuture = null;
};

_.extend(AppRunner.prototype, {
  // Start the app running, and restart it as necessary. Returns
  // immediately.
  start: function () {
    var self = this;

    if (self.fiber)
      throw new Error("already started?");

    self.startFuture = new Future;
    self.fiber = new Fiber(function () {
      self._fiber();
    }).run();
    self.startFuture.wait();
    self.startFuture = null;
  },

  // Shut down the app. stop() will block until the app is shut
  // down. This may involve waiting for bundling to
  // finish. Idempotent, however only one thread may be in stop() at a
  // time.
  stop: function () {
    var self = this;

    if (! self.fiber)
      return; // nothing to do

    if (self.exitFuture)
      throw new Error("another fiber already stopping?");

    // The existence of this future makes the fiber break out of its loop.
    self.exitFuture = new Future;

    self._runFutureReturn({ outcome: 'stopped' });

    self.exitFuture.wait();
    self.exitFuture = null;
  },

  // Run the program once, wait for it to exit, and then return. The
  // return value is same as onRunEnd.
  _runOnce: function (onListen) {
    var self = this;

    runLog.clearLog();
    self.proxy.setMode("hold");

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
      return { outcome: 'wrong-release',
               releaseNeeded:
               project.getMeteorReleaseVersion(self.appDirForVersionCheck) };
    }

    // Bundle up the app
    if (! self.firstRun)
      release.current.library.refresh(true); // pick up changes to packages

    var bundlePath = path.join(self.appDir, '.meteor', 'local', 'build');
    var bundleResult = bundler.bundle({
      appDir: self.appDir,
      outputPath: bundlePath,
      nodeModulesMode: "symlink",
      buildOptions: self.buildOptions
    });
    var watchSet = bundleResult.watchSet;

    // Read the settings file, if any
    var settings = null;
    var settingsWatchSet = new watch.WatchSet;
    var settingsMessages = buildmessage.capture({
      title: "preparing to run",
      rootPath: process.cwd()
    }, function () {
      if (self.settingsFile)
        settings = files.getSettings(self.settingsFile, settingsWatchSet);
    });

    // HACK: merge the watchset and messages from reading the settings
    // file into those from the build. This works fine but it sort of
    // messy. Maybe clean it up sometime.
    watchSet.merge(settingsWatchSet);
    if (settingsMessages.hasMessages()) {
      if (! bundleResult.errors)
        bundleResult.errors = settingsMessages;
      else
        bundleResult.errors.merge(settingsMessages);
    }

    // Were there errors?
    if (bundleResult.errors) {
      return {
        outcome: 'bundle-fail',
        bundleResult: bundleResult
      };
    }

    // Atomically (1) see if we've been stop()'d, (2) if not, create a
    // future that can be used to stop() us once we start running.
    if (self.exitFuture)
      return { outcome: 'stopped', bundleResult: bundleResult };
    if (self.runFuture)
      throw new Error("already have future?");
    var runFuture = self.runFuture = new Future;

    // Run the program
    var appProcess = new AppProcess({
      bundlePath: bundlePath,
      port: self.port,
      rootUrl: self.rootUrl,
      mongoUrl: self.mongoUrl,
      oplogUrl: self.oplogUrl,
      onExit: function (code, signal) {
        self._runFutureReturn({
          outcome: 'terminated',
          code: code,
          signal: signal,
          bundleResult: bundleResult
        });
      },
      program: self.program,
      onListen: function () {
        self.proxy.setMode("proxy");
        onListen && onListen();
        if (self.startFuture)
          self.startFuture['return']();
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
    if (self.watchForChanges) {
      watcher = new watch.Watcher({
        watchSet: watchSet,
        onChange: function () {
          self._runFutureReturn({
            outcome: 'changed',
            bundleResult: bundleResult
          });
        }
      });
    }

    // Wait for either the process to exit, or (if watchForChanges) a
    // source file to change. Or, for stop() to be called.
    var ret = runFuture.wait();
    self.runFuture = null;

    self.proxy.setMode("hold");
    appProcess.stop();
    if (watcher)
      watcher.stop();

    return ret;
  },

  _runFutureReturn: function (value) {
    var self = this;
    if (!self.runFuture)
      return;
    var runFuture = self.runFuture;
    self.runFuture = null;
    runFuture['return'](value);
  },

  _fiber: function () {
    var self = this;

    var crashCount = 0;
    var crashTimer = null;
    var firstRun = true;

    while (true) {
      crashTimer = setTimeout(function () {
        crashCount = 0;
      }, 2000);

      var runResult = self._runOnce(function () {
        /* onListen */
        if (! self.noRestartBanner && ! firstRun)
          runLog.logRestart();
      });
      firstRun = false;

      clearTimeout(crashTimer);
      if (runResult.outcome !== "terminated")
        crashCount = 0;

      var wantExit = self.onRunEnd ? !self.onRunEnd(runResult) : false;
      if (wantExit || self.exitFuture || runResult.outcome === "stopped")
        break;

      if (runResult.outcome === "wrong-release") {
        // Note that this code is currently dead, since the only onRunEnd
        // implementation always stops on wrong-release.
        runLog.log("=> Incompatible Meteor release.");
        if (self.watchForChanges)
          runLog.log("=> Waiting for file change.");
      }

      else if (runResult.outcome === "bundle-fail") {
        runLog.log("=> Errors prevented startup:\n\n" +
                        runResult.bundleResult.errors.formatMessages());
        if (self.watchForChanges)
          runLog.log("=> Your application has errors. " +
                     "Waiting for file change.");
      }

      else if (runResult.outcome === "changed")
        continue;

      else if (runResult.outcome === "terminated") {
        if (runResult.signal) {
          runLog.log('=> Exited from signal: ' + runResult.signal);
        } else if (runResult.code !== undefined) {
          runLog.log('=> Exited with code: ' + runResult.code);
        } else {
          // explanation should already have been logged
        }

        crashCount ++;
        if (crashCount < 3)
          continue;

        if (self.watchForChanges)
          runLog.log("=> Your application is crashing. " +
                     "Waiting for file change.");
      }

      else {
        throw new Error("unknown run outcome?");
      }

      if (self.watchForChanges) {
        var fut = new Future;
        var watcher = new watch.Watcher({
          watchSet: runResult.bundleResult.watchSet,
          onChange: function () { fut['return'](); }
        });
        self.proxy.setMode("errorpage");
        fut.wait();
        runLog.log("=> Modified -- restarting.");
        continue;
      }

      break;
    }

    // Giving up for good.
    if (self.exitFuture)
      self.exitFuture['return']();
    if (self.startFuture)
      self.startFuture['return']();

    self.fiber = null;
  }
});

///////////////////////////////////////////////////////////////////////////////

exports.AppRunner = AppRunner;
