var _ = require('underscore');
var Future = require('fibers/future');
var Fiber = require('fibers');
var fiberHelpers = require('./fiber-helpers.js');
var files = require('./files.js');
var watch = require('./watch.js');
var bundler = require('./bundler.js');
var release = require('./release.js');
var buildmessage = require('./buildmessage.js');
var runLog = require('./run-log.js');
var stats = require('./stats.js');
var cordova = require('./commands-cordova.js');
var Console = require('./console.js').Console;
var catalog = require('./catalog.js');
var Profile = require('./profile.js').Profile;

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
// Optional options: onExit, onListen, nodeOptions, settings

var AppProcess = function (options) {
  var self = this;

  self.projectContext = options.projectContext;
  self.bundlePath = options.bundlePath;
  self.port = options.port;
  self.listenHost = options.listenHost;
  self.rootUrl = options.rootUrl;
  self.mongoUrl = options.mongoUrl;
  self.oplogUrl = options.oplogUrl;
  self.mobileServerUrl = options.mobileServerUrl;

  self.onExit = options.onExit;
  self.onListen = options.onListen;
  self.nodeOptions = options.nodeOptions || [];
  self.nodePath = options.nodePath || [];
  self.debugPort = options.debugPort;
  self.settings = options.settings;

  self.proc = null;
  self.madeExitCallback = false;
  self.ipcPipe = options.ipcPipe;
};

_.extend(AppProcess.prototype, {
  // Call to start the process.
  start: function () {
    var self = this;

    if (self.proc)
      throw new Error("already started?");

    // Start the app!
    self.proc = self._spawn();

    // Send stdout and stderr to the runLog
    var eachline = require('eachline');
    eachline(self.proc.stdout, 'utf8', fiberHelpers.inBareFiber(function (line) {
      if (line.match(/^LISTENING\s*$/)) {
        // This is the child process telling us that it's ready to receive
        // connections.  (It does this because we told it to with
        // $METEOR_PRINT_ON_LISTEN.)
        self.onListen && self.onListen();

      } else {
        runLog.logAppOutput(line);
      }
    }));

    eachline(self.proc.stderr, 'utf8', fiberHelpers.inBareFiber(function (line) {
      if (self.debugPort &&
          line.indexOf("debugger listening on port ") >= 0) {
        Console.enableProgressDisplay(false);
        return;
      }

      runLog.logAppOutput(line, true);
    }));

    // Watch for exit and for stdio to be fully closed (so that we don't miss
    // log lines).
    self.proc.on('close', fiberHelpers.inBareFiber(function (code, signal) {
      self._maybeCallOnExit(code, signal);
    }));

    self.proc.on('error', fiberHelpers.inBareFiber(function (err) {
      // if the error is the result of .send command over ipc pipe, ignore it
      if (self._refreshing) {
        return;
      }

      runLog.log("Couldn't spawn process: " + err.message,  { arrow: true });

      // node docs say that it might make both an 'error' and a
      // 'close' callback, so we use a guard to make sure we only call
      // onExit once.
      self._maybeCallOnExit();
    }));

    // This happens sometimes when we write a keepalive after the app
    // is dead. If we don't register a handler, we get a top level
    // exception and the whole app dies.
    // http://stackoverflow.com/questions/2893458/uncatchable-errors-in-node-js
    self.proc.stdin.on('error', function () {});

    // When the parent process exits (i.e. the server is shutting down and
    // not merely restarting), make sure to disconnect any still-connected
    // shell clients.
    require("./cleanup.js").onExit(function() {
      require("./server/shell-server.js").disable(
        self.projectContext.getMeteorShellDirectory()
      );
    });
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

    self.onListen = null;
    self.onExit = null;
  },

  _computeEnvironment: function () {
    var self = this;
    var env = _.extend({}, process.env);

    env.PORT = self.port;
    env.ROOT_URL = self.rootUrl;
    env.MONGO_URL = self.mongoUrl;
    if (self.mobileServerUrl) {
      env.MOBILE_DDP_URL = self.mobileServerUrl;
      env.MOBILE_ROOT_URL = self.mobileServerUrl;
    }

    if (self.oplogUrl) {
      env.MONGO_OPLOG_URL = self.oplogUrl;
    }
    if (self.settings) {
      env.METEOR_SETTINGS = self.settings;
    } else {
      delete env.METEOR_SETTINGS;
    }
    if (self.listenHost) {
      env.BIND_IP = self.listenHost;
    } else {
      delete env.BIND_IP;
    }
    env.APP_ID = self.projectContext.appIdentifier;

    // Display errors from (eg) the NPM connect module over the network.
    env.NODE_ENV = 'development';
    // We run the server behind our own proxy, so we need to increment
    // the HTTP forwarded count.
    env.HTTP_FORWARDED_COUNT =
      "" + ((parseInt(process.env['HTTP_FORWARDED_COUNT']) || 0) + 1);

    var shellDir = self.projectContext.getMeteorShellDirectory();
    files.mkdir_p(shellDir);

    // We need to convert to OS path here because the running app doesn't
    // have access to path translation functions
    env.METEOR_SHELL_DIR = files.convertToOSPath(shellDir);

    env.METEOR_PARENT_PID =
      process.env.METEOR_BAD_PARENT_PID_FOR_TEST ? "foobar" : process.pid;

    env.METEOR_PRINT_ON_LISTEN = 'true';

    // use node's path module and not 'files.js' because NODE_PATH is an
    // environment variable passed to an external process and needs to be
    // constructed in the OS-style.
    var path = require('path');
    env.NODE_PATH =
      self.nodePath.join(path.delimiter);

    return env;
  },

  // Spawn the server process and return the handle from child_process.spawn.
  _spawn: function () {
    var self = this;

    // Path conversions
    var nodePath = process.execPath; // This path is an OS path already
    var entryPoint = files.convertToOSPath(
      files.pathJoin(self.bundlePath, 'main.js'));

    // Setting options
    var opts = _.clone(self.nodeOptions);

    var attach;
    if (self.debugPort) {
      attach = require("./inspector.js").start(self.debugPort, entryPoint);

      // If you do opts.push("--debug-brk", port) it doesn't work on Windows
      // for some reason
      opts.push("--debug-brk=" + attach.suggestedDebugBrkPort);
    }

    opts.push(entryPoint);

    // Call node
    var child_process = require('child_process');
    // setup the 'ipc' pipe if further communication between app and proxy is
    // expected
    var ioOptions = self.ipcPipe ? ['pipe', 'pipe', 'pipe', 'ipc'] : 'pipe';
    var child = child_process.spawn(nodePath, opts, {
      env: self._computeEnvironment(),
      stdio: ioOptions
    });

    // Attach inspector
    if (attach) {
      attach(child);
    }

    return child;
  }
});

///////////////////////////////////////////////////////////////////////////////
// AppRunner
///////////////////////////////////////////////////////////////////////////////

// Given an app, bundle and run the app. If the app's source changes,
// kill, rebundle, and rerun it. If the app dies, restart it, unless
// it dies repeatedly immediately after being started, in which case
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
// - Other options: port, mongoUrl, oplogUrl, buildOptions, rootUrl,
//   settingsFile, program, proxy, recordPackageUsage
//
// To use, construct an instance of AppRunner, and then call start() to start it
// running. To stop it, either return false from onRunEnd, or call stop().  (But
// don't call stop() from inside onRunEnd: that causes a deadlock.)
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
//     typed 'meteor update' in another window). An 'displayReleaseNeeded'
//     attribute will be present giving the app's release name.
//
//   - 'conflicting-versions': the constraint solver could not find a set of
//     package versions to use that would satisfy the constraints of
//     .meteor/versions and .meteor/packages. This could be caused by conflicts
//     in .meteor/versions, conflicts in .meteor/packages, and/or inconsistent
//     changes to the dependencies in local packages.
//
//   - 'stopped': stop() was called while a run was in progress.
//
// - errors: for 'bundle-fail', the buildmessage messages object corresponding
//      to the error
//
// - watchSet: for runs in which there's a reason to wait for file changes
//      ('bundle-fail' and 'terminated'), the WatchSet to wait on.
var AppRunner = function (options) {
  var self = this;

  self.projectContext = options.projectContext;

  // note: run-all.js updates port directly
  self.port = options.port;
  self.listenHost = options.listenHost;
  self.mongoUrl = options.mongoUrl;
  self.oplogUrl = options.oplogUrl;
  self.buildOptions = options.buildOptions;
  self.rootUrl = options.rootUrl;
  self.mobileServerUrl = options.mobileServerUrl;
  self.settingsFile = options.settingsFile;
  self.debugPort = options.debugPort;
  self.proxy = options.proxy;
  self.watchForChanges =
    options.watchForChanges === undefined ? true : options.watchForChanges;
  self.onRunEnd = options.onRunEnd;
  self.noRestartBanner = options.noRestartBanner;
  self.recordPackageUsage =
    options.recordPackageUsage === undefined ? true : options.recordPackageUsage;
  self.omitPackageMapDeltaDisplayOnFirstRun =
    options.omitPackageMapDeltaDisplayOnFirstRun;

  // Keep track of the app's Cordova plugins and platforms. If the set
  // of plugins or platforms changes from one run to the next, we just
  // exit, because we don't yet have a way to, for example, get the new
  // plugins to the mobile clients or stop a running client on a
  // platform that has been removed.
  self.cordovaPlugins = null;
  self.cordovaPlatforms = null;

  self.fiber = null;
  self.startFuture = null;
  self.runFuture = null;
  self.exitFuture = null;
  self.watchFuture = null;

  // If this future is set with self.awaitFutureBeforeStart, then for the first
  // run, we will wait on it just before self.appProcess.start() is called.
  self._beforeStartFuture = null;
  // A hacky state variable that indicates that the proxy process (this process)
  // is communicating to the app process over ipc. If an error in communication
  // occurs, we can distinguish it in a callback handling the 'error' event.
  self._refreshing = false;
};

_.extend(AppRunner.prototype, {
  // Start the app running, and restart it as necessary. Returns
  // immediately.
  start: function () {
    var self = this;

    if (self.fiber)
      throw new Error("already started?");

    self.startFuture = new Future;
    // XXX I think it's correct to not try to use bindEnvironment here:
    //     the extra fiber should be independent of this one.
    self.fiber = Fiber(function () {
      self._fiber();
    });
    self.fiber.run();
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
    self._watchFutureReturn();
    if (self._beforeStartFuture && ! self._beforeStartFuture.isResolved()) {
      // If we stopped before mongod started (eg, due to mongod startup
      // failure), unblock the runner fiber from waiting for mongod to start.
      self._beforeStartFuture.return(true);
    }
    self.exitFuture.wait();
    self.exitFuture = null;
  },

  awaitFutureBeforeStart: function(future) {
    var self = this;
    if (self._beforeStartFuture) {
      throw new Error("awaitFutureBeforeStart called twice?");
    } else if (future instanceof Future) {
      self._beforeStartFuture = future;
    } else {
      throw new Error("non-Future passed to awaitFutureBeforeStart");
    }
  },

  // Run the program once, wait for it to exit, and then return. The
  // return value is same as onRunEnd.
  _runOnce: function (options) {
    var self = this;
    options = options || {};
    var firstRun = options.firstRun;

    Console.enableProgressDisplay(true);

    runLog.clearLog();
    self.proxy.setMode("hold");

    // Bundle up the app
    var bundlePath = self.projectContext.getProjectLocalDirectory('build');

    // Cache the server target because the server will not change inside
    // a single invocation of _runOnce().
    var cachedServerWatchSet;

    var bundleApp = function () {
      if (! firstRun) {
        // If the build fails in a way that could be fixed by a refresh, allow
        // it even if we refreshed previously, since that might have been a
        // little while ago.
        catalog.triedToRefreshRecently = false;

        // If this isn't the first time we've run, we need to reset the project
        // context since everything we have cached may have changed.
        // XXX We can try to be a little less conservative here:
        // - Don't re-build the whole local catalog if we know which local
        //   packages have changed.  (This one might be a little trickier due
        //   to how the WatchSets are laid out.  Might be possible to avoid
        //   re-building the local catalog at all if packages didn't change
        //   at all, though.)
        self.projectContext.reset({}, {
          // Don't forget all Isopack objects; just make sure to check that they
          // are up to date.
          softRefreshIsopacks: true,
          // Don't forget the package map we calculated last time, even if we
          // didn't write it to disk (because, eg, we're not running with a
          // release that matches the app's release).  While we will still check
          // our constraints, we will use the map we calculated last time as the
          // previous solution (not what's on disk). Package deltas should be
          // shown from the previous solution.
          preservePackageMap: true
        });
        var messages = buildmessage.capture(function () {
          self.projectContext.readProjectMetadata();
        });
        if (messages.hasMessages()) {
          return {
            runResult: {
              outcome: 'bundle-fail',
              errors: messages,
              watchSet: self.projectContext.getProjectAndLocalPackagesWatchSet()
            }
          };
        }
      }

      // Check to make sure we're running the right version of Meteor.
      var wrongRelease = ! release.usingRightReleaseForApp(self.projectContext);
      if (wrongRelease) {
        return {
          runResult: {
            outcome: 'wrong-release',
            displayReleaseNeeded:
              self.projectContext.releaseFile.displayReleaseName
          }
        };
      }

      messages = buildmessage.capture(function () {
        self.projectContext.prepareProjectForBuild();
      });
      if (messages.hasMessages()) {
        return {
          runResult: {
            outcome: 'bundle-fail',
            errors: messages,
            watchSet: self.projectContext.getProjectAndLocalPackagesWatchSet()
          }
        };
      }

      // Show package changes... unless it's the first time in test-packages.
      if (!(self.omitPackageMapDeltaDisplayOnFirstRun && firstRun)) {
        self.projectContext.packageMapDelta.displayOnConsole();
      }

      if (self.recordPackageUsage) {
        stats.recordPackages({
          what: "sdk.run",
          projectContext: self.projectContext
        });
      }

      var bundleResult = Profile.run("Rebuild App", function () {
        var includeNodeModules = 'symlink';

        // On Windows we cannot symlink node_modules. Copying them is too slow.
        // Instead receive the NODE_PATH env that we need to set and set it
        // later on running.
        if (process.platform === 'win32') {
          includeNodeModules = 'reference-directly';
        }

        return bundler.bundle({
          projectContext: self.projectContext,
          outputPath: bundlePath,
          includeNodeModules: includeNodeModules,
          buildOptions: self.buildOptions,
          hasCachedBundle: !! cachedServerWatchSet
        });
      });

      // Keep the server watch set from the initial bundle, because subsequent
      // bundles will not contain a server target.
      if (cachedServerWatchSet) {
        bundleResult.serverWatchSet = cachedServerWatchSet;
      } else {
        cachedServerWatchSet = bundleResult.serverWatchSet;
      }

      if (bundleResult.errors) {
        return {
          runResult: {
            outcome: 'bundle-fail',
            errors: bundleResult.errors,
            watchSet: combinedWatchSetForBundleResult(bundleResult)
          }
        };
      } else {
        return { bundleResult: bundleResult };
      }
    };

    var combinedWatchSetForBundleResult = function (br) {
      var watchSet = br.serverWatchSet.clone();
      watchSet.merge(br.clientWatchSet);
      return watchSet;
    };

    var bundleResult;
    var bundleResultOrRunResult = bundleApp();
    if (bundleResultOrRunResult.runResult)
      return bundleResultOrRunResult.runResult;
    bundleResult = bundleResultOrRunResult.bundleResult;

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
    if (settingsMessages.hasMessages()) {
      return {
        outcome: 'bundle-fail',
        errors: settingsMessages,
        watchSet: settingsWatchSet
      };
    }

    firstRun = false;

    var platforms = self.projectContext.platformList.getCordovaPlatforms();
    platforms.sort();
    if (self.cordovaPlatforms &&
        ! _.isEqual(self.cordovaPlatforms, platforms)) {
      return {
        outcome: 'outdated-cordova-platforms'
      };
    }
    // XXX This is racy --- we should get this from the pre-runner build, not
    // from the first runner build.
    self.cordovaPlatforms = platforms;

    var plugins = cordova.getCordovaDependenciesFromStar(
      bundleResult.starManifest);

    if (self.cordovaPlugins && ! _.isEqual(self.cordovaPlugins, plugins)) {
      return {
        outcome: 'outdated-cordova-plugins'
      };
    }
    // XXX This is racy --- we should get this from the pre-runner build, not
    // from the first runner build.
    self.cordovaPlugins = plugins;

    var serverWatchSet = bundleResult.serverWatchSet;
    serverWatchSet.merge(settingsWatchSet);

    // We only can refresh the client without restarting the server if the
    // client contains the 'autoupdate' package.
    var canRefreshClient = self.projectContext.packageMap &&
          self.projectContext.packageMap.getInfo('autoupdate');

    if (! canRefreshClient) {
      // Restart server on client changes if we can't refresh the client.
      serverWatchSet = combinedWatchSetForBundleResult(bundleResult);
    }

    // Atomically (1) see if we've been stop()'d, (2) if not, create a
    // future that can be used to stop() us once we start running.
    if (self.exitFuture)
      return { outcome: 'stopped' };
    if (self.runFuture)
      throw new Error("already have future?");
    var runFuture = self.runFuture = new Future;

    // Run the program
    options.beforeRun && options.beforeRun();
    var appProcess = new AppProcess({
      projectContext: self.projectContext,
      bundlePath: bundlePath,
      port: self.port,
      listenHost: self.listenHost,
      rootUrl: self.rootUrl,
      mongoUrl: self.mongoUrl,
      oplogUrl: self.oplogUrl,
      mobileServerUrl: self.mobileServerUrl,
      onExit: function (code, signal) {
        self._runFutureReturn({
          outcome: 'terminated',
          code: code,
          signal: signal,
          watchSet: combinedWatchSetForBundleResult(bundleResult)
        });
      },
      debugPort: self.debugPort,
      onListen: function () {
        self.proxy.setMode("proxy");
        options.onListen && options.onListen();
        if (self.startFuture)
          self.startFuture['return']();
      },
      nodeOptions: getNodeOptionsFromEnvironment(),
      nodePath: _.map(bundleResult.nodePath, files.convertToOSPath),
      settings: settings,
      ipcPipe: self.watchForChanges
    });

    // Empty self._beforeStartFutures and await its elements.
    if (options.firstRun && self._beforeStartFuture) {
      var stopped = self._beforeStartFuture.wait();
      if (stopped) {
        return true;
      }
    }

    appProcess.start();

    // Start watching for changes for files if requested. There's no
    // hurry to do this, since clientWatchSet contains a snapshot of the
    // state of the world at the time of bundling, in the form of
    // hashes and lists of matching files in each directory.
    var serverWatcher;
    var clientWatcher;

    if (self.watchForChanges) {
      serverWatcher = new watch.Watcher({
        watchSet: serverWatchSet,
        onChange: function () {
          self._runFutureReturn({
            outcome: 'changed'
          });
        }
      });
    }

    var setupClientWatcher = function () {
      clientWatcher && clientWatcher.stop();
      clientWatcher = new watch.Watcher({
         watchSet: bundleResult.clientWatchSet,
         onChange: function () {
          var outcome = watch.isUpToDate(serverWatchSet)
                      ? 'changed-refreshable' // only a client asset has changed
                      : 'changed'; // both a client and server asset changed
          self._runFutureReturn({ outcome: outcome });
         }
      });
    };
    if (self.watchForChanges && canRefreshClient) {
      setupClientWatcher();
    }

    Console.enableProgressDisplay(false);

    // Wait for either the process to exit, or (if watchForChanges) a
    // source file to change. Or, for stop() to be called.
    var ret = runFuture.wait();

    try {
      while (ret.outcome === 'changed-refreshable') {
        if (! canRefreshClient)
          throw Error("Can't refresh client?");

        // We stay in this loop as long as only refreshable assets have changed.
        // When ret.refreshable becomes false, we restart the server.
        bundleResultOrRunResult = bundleApp();
        if (bundleResultOrRunResult.runResult)
          return bundleResultOrRunResult.runResult;
        bundleResult = bundleResultOrRunResult.bundleResult;

        var oldFuture = self.runFuture = new Future;

        // Notify the server that new client assets have been added to the
        // build.
        self._refreshing = true;
        appProcess.proc.send({ refresh: 'client' });
        self._refreshing = false;

        // Establish a watcher on the new files.
        setupClientWatcher();

        runLog.logClientRestart();

        // Wait until another file changes.
        ret = oldFuture.wait();
      }
    } finally {
      self.runFuture = null;

      if (ret.outcome === 'changed') {
        runLog.logTemporary("=> Server modified -- restarting...");
      }

      self.proxy.setMode("hold");
      appProcess.stop();

      serverWatcher && serverWatcher.stop();
      clientWatcher && clientWatcher.stop();
    }

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

  _watchFutureReturn: function () {
    var self = this;
    if (!self.watchFuture)
      return;
    var watchFuture = self.watchFuture;
    self.watchFuture = null;
    watchFuture.return();
  },

  _fiber: function () {
    var self = this;

    var crashCount = 0;
    var crashTimer = null;
    var firstRun = true;

    while (true) {

      var resetCrashCount = function () {
        crashTimer = setTimeout(function () {
          crashCount = 0;
        }, 3000);
      };

      var runResult = self._runOnce({
        onListen: function () {
          if (! self.noRestartBanner && ! firstRun)
            runLog.logRestart();
        },
        beforeRun: resetCrashCount,
        firstRun: firstRun
      });
      firstRun = false;

      clearTimeout(crashTimer);
      if (runResult.outcome !== "terminated")
        crashCount = 0;

      var wantExit = self.onRunEnd ? !self.onRunEnd(runResult) : false;
      if (wantExit || self.exitFuture || runResult.outcome === "stopped")
        break;

      if (runResult.outcome === "wrong-release" ||
          runResult.outcome === "conflicting-versions") {
        // Since the only implementation of onRunEnd sets wantExit on these
        // outcomes, we will never get here currently. Moreover, it's not
        // actually possible for us to handle these cases correctly, because our
        // contract says that we should wait for changes, but runResult doesn't
        // actually contain a watchset. Oops. Just throw an exception for now.
        throw new Error("can't handle outcome " + runResult.outcome);
      }

      else if (runResult.outcome === "bundle-fail") {
        runLog.log("Errors prevented startup:\n\n" +
                        runResult.errors.formatMessages(),  { arrow: true });
        if (self.watchForChanges) {
          runLog.log("Your application has errors. " +
                     "Waiting for file change.",  { arrow: true });
          Console.enableProgressDisplay(false);
        }
      }

      else if (runResult.outcome === "changed")
        continue;

      else if (runResult.outcome === "terminated") {
        if (runResult.signal) {
          runLog.log('Exited from signal: ' + runResult.signal, { arrow: true });
        } else if (runResult.code !== undefined) {
          runLog.log('Exited with code: ' + runResult.code, { arrow: true });
        } else {
          // explanation should already have been logged
        }

        crashCount ++;
        if (crashCount < 3)
          continue;

        if (self.watchForChanges) {
          runLog.log("Your application is crashing. " +
                     "Waiting for file change.",
                     { arrow: true });
          Console.enableProgressDisplay(false);
        }
      }

      else {
        throw new Error("unknown run outcome?");
      }

      if (self.watchForChanges) {
        self.watchFuture = new Future;

        if (!runResult.watchSet)
          throw Error("watching for changes with no watchSet?");
        var watcher = new watch.Watcher({
          watchSet: runResult.watchSet,
          onChange: function () {
            self._watchFutureReturn();
          }
        });
        self.proxy.setMode("errorpage");
        // If onChange wasn't called synchronously (clearing watchFuture), wait
        // on it.
        self.watchFuture && self.watchFuture.wait();
        // While we were waiting, did somebody stop() us?
        if (self.exitFuture)
          break;
        runLog.log("Modified -- restarting.",  { arrow: true });
        Console.enableProgressDisplay(true);
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
