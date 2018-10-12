var _ = require('underscore');
var Fiber = require('fibers');
const uuid = require("uuid");
var fiberHelpers = require('../utils/fiber-helpers.js');
var files = require('../fs/files.js');
var watch = require('../fs/watch.js');
var bundler = require('../isobuild/bundler.js');
var buildmessage = require('../utils/buildmessage.js');
var runLog = require('./run-log.js');
var stats = require('../meteor-services/stats.js');
var Console = require('../console/console.js').Console;
var catalog = require('../packaging/catalog/catalog.js');
var Profile = require('../tool-env/profile.js').Profile;
var release = require('../packaging/release.js');
import { pluginVersionsFromStarManifest } from '../cordova/index.js';
import { CordovaBuilder } from '../cordova/builder.js';
import { closeAllWatchers } from "../fs/safe-watcher.js";
import { eachline } from "../utils/eachline.js";
import { loadIsopackage } from '../tool-env/isopackets.js';

const hasOwn = Object.prototype.hasOwnProperty;

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
  self.inspect = options.inspect;
  self.settings = options.settings;
  self.testMetadata = options.testMetadata;

  self.proc = null;
  self.madeExitCallback = false;
};

_.extend(AppProcess.prototype, {
  // Call to start the process.
  start: function () {
    var self = this;

    if (self.proc) {
      throw new Error("already started?");
    }

    // Start the app!
    self.proc = self._spawn();

    eachline(self.proc.stdout, function (line) {
      if (line.match(/^LISTENING\s*$/)) {
        // This is the child process telling us that it's ready to receive
        // connections.  (It does this because we told it to with
        // $METEOR_PRINT_ON_LISTEN.)
        self.onListen && self.onListen();

      } else {
        runLog.logAppOutput(line);
      }
    });

    eachline(self.proc.stderr, function (line) {
      runLog.logAppOutput(line, true);
    });

    // Watch for exit and for stdio to be fully closed (so that we don't miss
    // log lines).
    self.proc.on('close', async function (code, signal) {
      self._maybeCallOnExit(code, signal);
    });

    self.proc.on('error', async function (err) {
      runLog.log("Couldn't spawn process: " + err.message,  { arrow: true });

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
  },

  _maybeCallOnExit: function (code, signal) {
    var self = this;
    if (self.madeExitCallback) {
      return;
    }
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
      // Warn the developer that we are not going to use their environment var.
      if (env.METEOR_SETTINGS) {
        runLog.log(
          "WARNING: The 'METEOR_SETTINGS' environment variable is ignored " +
          "when running in development (as you are doing now).  Instead, use " +
          "the '--settings settings.json' option to see reactive changes " +
          "when settings are changed.  For more information, see the " +
          "documentation for 'Meteor.settings': " +
          "https://docs.meteor.com/api/core.html#Meteor-settings" +
          "\n");
      }

      // To provide a consistent, reactive experience in development, do
      // not use settings provided via the environment variable.
      delete env.METEOR_SETTINGS;
    }
    if (self.testMetadata) {
      env.TEST_METADATA = JSON.stringify(self.testMetadata);
    } else {
      delete env.TEST_METADATA;
    }
    if (self.listenHost) {
      env.BIND_IP = self.listenHost;
    } else {
      delete env.BIND_IP;
    }
    env.APP_ID = self.projectContext.appIdentifier;

    // We run the server behind our own proxy, so we need to increment
    // the HTTP forwarded count.
    env.HTTP_FORWARDED_COUNT =
      "" + ((parseInt(process.env['HTTP_FORWARDED_COUNT']) || 0) + 1);

    if (self.inspect &&
        self.inspect.break) {
      env.METEOR_INSPECT_BRK = self.inspect.port;
    } else {
      delete env.METEOR_INSPECT_BRK;
    }

    var shellDir = self.projectContext.getMeteorShellDirectory();
    files.mkdir_p(shellDir);

    // We need to convert to OS path here because the running app doesn't
    // have access to path translation functions
    env.METEOR_SHELL_DIR = files.convertToOSPath(shellDir);

    env.METEOR_PARENT_PID =
      process.env.METEOR_BAD_PARENT_PID_FOR_TEST ? "foobar" : process.pid;

    env.METEOR_PRINT_ON_LISTEN = 'true';

    return env;
  },

  // Spawn the server process and return the handle from child_process.spawn.
  _spawn: function () {
    var self = this;

    // Path conversions
    var entryPoint = files.convertToOSPath(
      files.pathJoin(self.bundlePath, 'main.js'));

    // Setting options
    var opts = _.clone(self.nodeOptions);

    if (self.inspect) {
      // Always use --inspect rather than --inspect-brk, even when
      // self.inspect.break is true, because --inspect-brk stops at the
      // very first instruction executed by the child process, which is
      // too early to set any meaningful breakpoints. Instead, we want to
      // stop just after server code has loaded but before it begins to
      // execute. See _computeEnvironment for logic that sets
      // env.METEOR_INSPECT_BRK in that case.
      opts.push("--inspect=" + self.inspect.port);
    }

    opts.push(entryPoint);

    // Call node
    var child_process = require('child_process');
    // setup the 'ipc' pipe if further communication between app and proxy is
    // expected
    var child = child_process.spawn(process.execPath, opts, {
      env: self._computeEnvironment(),
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    // Add a child.sendMessage(topic, payload) method to this child
    // process object.
    loadIsopackage("inter-process-messaging").enable(child);

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
  self.cordovaRunner = options.cordovaRunner;
  self.settingsFile = options.settingsFile;
  self.testMetadata = options.testMetadata;
  self.inspect = options.inspect;
  self.proxy = options.proxy;
  self.watchForChanges =
    options.watchForChanges === undefined ? true : options.watchForChanges;
  self.onRunEnd = options.onRunEnd;
  self.noRestartBanner = options.noRestartBanner;
  self.recordPackageUsage =
    options.recordPackageUsage === undefined ? true : options.recordPackageUsage;
  self.omitPackageMapDeltaDisplayOnFirstRun =
    options.omitPackageMapDeltaDisplayOnFirstRun;

  self.fiber = null;
  self.startPromise = null;
  self.runPromise = null;
  self.exitPromise = null;
  self.watchPromise = null;
  self._promiseResolvers = {};

  // If this promise is set with self.makeBeforeStartPromise, then for the first
  // run, we will wait on it just before self.appProcess.start() is called.
  self._beforeStartPromise = null;

  // Builders saved across rebuilds, so that targets can be re-written in
  // place instead of created again from scratch.
  self.builders = Object.create(null);
};

_.extend(AppRunner.prototype, {
  // Start the app running, and restart it as necessary. Returns
  // immediately.
  start: function () {
    var self = this;

    if (self.fiber) {
      throw new Error("already started?");
    }

    self.startPromise = self._makePromise("start");

    self.fiber = Fiber(function () {
      self._fiber();
    });
    self.fiber.run();

    self.startPromise.await();
    self.startPromise = null;
  },

  _makePromise: function (name) {
    var self = this;
    return new Promise(function (resolve) {
      self._promiseResolvers[name] = resolve;
    });
  },

  _resolvePromise: function (name, value) {
    var resolve = this._promiseResolvers[name];
    if (resolve) {
      this._promiseResolvers[name] = null;
      resolve(value);
    }
  },

  _cleanUpPromises: function () {
    if (this._promiseResolvers) {
      _.each(this._promiseResolvers, function (resolve) {
        resolve && resolve();
      });
      this._promiseResolvers = null;
    }
  },

  // Shut down the app. stop() will block until the app is shut
  // down. This may involve waiting for bundling to
  // finish. Idempotent, however only one thread may be in stop() at a
  // time.
  stop: function () {
    var self = this;

    if (! self.fiber) {
      // nothing to do
      return;
    }

    if (self.exitPromise) {
      throw new Error("another fiber already stopping?");
    }

    // The existence of this promise makes the fiber break out of its loop.
    self.exitPromise = self._makePromise("exit");

    self._resolvePromise("run", { outcome: 'stopped' });
    self._resolvePromise("watch");

    if (self._beforeStartPromise) {
      // If we stopped before mongod started (eg, due to mongod startup
      // failure), unblock the runner fiber from waiting for mongod to start.
      self._resolvePromise("beforeStart", true);
    }

    self.exitPromise.await();
    self.exitPromise = null;
  },

  // Returns a function that can be called to resolve _beforeStartPromise.
  makeBeforeStartPromise: function () {
    if (this._beforeStartPromise) {
      throw new Error("makeBeforeStartPromise called twice?");
    }
    this._beforeStartPromise = this._makePromise("beforeStart");
    return this._promiseResolvers["beforeStart"];
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

      var bundleResult = Profile.run((firstRun?"B":"Reb")+"uild App", () => {
        return bundler.bundle({
          projectContext: self.projectContext,
          outputPath: bundlePath,
          includeNodeModules: "symlink",
          buildOptions: self.buildOptions,
          hasCachedBundle: !! cachedServerWatchSet,
          previousBuilders: self.builders,
          // Permit delayed bundling of client architectures if the
          // console is interactive.
          allowDelayedClientBuilds: ! Console.isHeadless(),
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
    if (bundleResultOrRunResult.runResult) {
      return bundleResultOrRunResult.runResult;
    }
    bundleResult = bundleResultOrRunResult.bundleResult;

    firstRun = false;

    // Read the settings file, if any
    var settings = null;
    var settingsWatchSet = new watch.WatchSet;
    var settingsMessages = buildmessage.capture({
      title: "preparing to run",
      rootPath: process.cwd()
    }, function () {
      if (self.settingsFile) {
        settings = files.getSettings(self.settingsFile, settingsWatchSet);
      }
    });
    if (settingsMessages.hasMessages()) {
      return {
        outcome: 'bundle-fail',
        errors: settingsMessages,
        watchSet: settingsWatchSet
      };
    }

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

    const cordovaRunner = self.cordovaRunner;
    if (cordovaRunner) {
      const pluginVersions =
        pluginVersionsFromStarManifest(bundleResult.starManifest);

      if (!cordovaRunner.started) {
        const { settingsFile, mobileServerUrl } = self;
        const messages = buildmessage.capture(() => {
          cordovaRunner.prepareProject(bundlePath, pluginVersions,
            { settingsFile, mobileServerUrl });
        });

        if (messages.hasMessages()) {
          return {
            outcome: 'bundle-fail',
            errors: messages,
            watchSet: combinedWatchSetForBundleResult(bundleResult)
          };
        }
        cordovaRunner.printWarningsIfNeeded();
      } else {
        // If the set of Cordova platforms or plugins changes from one run
        // to the next, we just exit, because we don't yet have a way to,
        // for example, get the new plugins to the mobile clients or stop a
        // running client on a platform that has been removed.

        if (cordovaRunner.havePlatformsChangedSinceLastRun()) {
          return { outcome: 'outdated-cordova-platforms' };
        }

        if (cordovaRunner.havePluginsChangedSinceLastRun(pluginVersions)) {
          return { outcome: 'outdated-cordova-plugins' };
        }
      }
    }

    // Atomically (1) see if we've been stop()'d, (2) if not, create a
    // promise that can be used to stop() us once we start running.
    if (self.exitPromise) {
      return { outcome: 'stopped' };
    }

    // We should have reset self.runPromise to null by now, but await it
    // just in case it's still defined.
    Promise.await(self.runPromise);

    var runPromise = self.runPromise = self._makePromise("run");

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
        self._resolvePromise("run", {
          outcome: 'terminated',
          code: code,
          signal: signal,
          watchSet: combinedWatchSetForBundleResult(bundleResult)
        });
      },
      inspect: self.inspect,
      onListen: function () {
        self.proxy.setMode("proxy");
        options.onListen && options.onListen();
        self._resolvePromise("start");
      },
      nodeOptions: getNodeOptionsFromEnvironment(),
      settings: settings,
      testMetadata: self.testMetadata,
    });

    if (options.firstRun && self._beforeStartPromise) {
      var stopped = self._beforeStartPromise.await();
      if (stopped) {
        return true;
      }
    }

    appProcess.start();
    function maybePrintLintWarnings(bundleResult) {
      if (! (self.projectContext.lintAppAndLocalPackages &&
             bundleResult.warnings)) {
        return;
      }
      if (bundleResult.warnings.hasMessages()) {
        const formattedMessages = bundleResult.warnings.formatMessages();
        runLog.log(
          `Linted your app.\n\n${ formattedMessages }`,
          { arrow: true });
      } else {
        runLog.log('Linted your app. No linting errors.',
                   { arrow: true });
      }
    }
    maybePrintLintWarnings(bundleResult);

    if (cordovaRunner && !cordovaRunner.started) {
      cordovaRunner.startRunTargets();
    }

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
          self._resolvePromise("run", {
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
          self._resolvePromise('run', { outcome: outcome });
         }
      });
    };
    if (self.watchForChanges && canRefreshClient) {
      setupClientWatcher();
    }

    function pauseClient(arch) {
      return appProcess.proc.sendMessage("webapp-pause-client", { arch });
    }

    async function refreshClient(arch) {
      if (typeof arch === "string") {
        // This message will reload the client program and unpause it.
        await appProcess.proc.sendMessage("webapp-reload-client", { arch });
      }
      // If arch is not a string, the receiver of this message should
      // assume all clients need to be refreshed.
      await appProcess.proc.sendMessage("client-refresh");
    }

    function runPostStartupCallbacks(bundleResult) {
      const callbacks = bundleResult.postStartupCallbacks;
      if (! callbacks) return;

      const messages = buildmessage.capture({
        title: "running post-startup callbacks"
      }, () => {
        while (callbacks.length > 0) {
          const fn = callbacks.shift();
          try {
            Promise.await(fn({
              // Miscellany that the callback might find useful.
              pauseClient,
              refreshClient,
              runLog,
            }));
          } catch (error) {
            buildmessage.error(error.message);
          }
        }
      });

      if (messages.hasMessages()) {
        return {
          outcome: "bundle-fail",
          errors: messages,
          watchSet: bundleResult.clientWatchSet,
        };
      }
    }

    Console.enableProgressDisplay(false);

    const postStartupResult = runPostStartupCallbacks(bundleResult);
    if (postStartupResult) return postStartupResult;

    // Wait for either the process to exit, or (if watchForChanges) a
    // source file to change. Or, for stop() to be called.
    var ret = runPromise.await();

    try {
      while (ret.outcome === 'changed-refreshable') {
        if (! canRefreshClient) {
          throw Error("Can't refresh client?");
        }

        // We stay in this loop as long as only refreshable assets have changed.
        // When ret.refreshable becomes false, we restart the server.
        bundleResultOrRunResult = bundleApp();
        if (bundleResultOrRunResult.runResult) {
          return bundleResultOrRunResult.runResult;
        }
        bundleResult = bundleResultOrRunResult.bundleResult;

        maybePrintLintWarnings(bundleResult);

        runLog.logClientRestart();

        var oldPromise = self.runPromise = self._makePromise("run");

        refreshClient();

        // Establish a watcher on the new files.
        setupClientWatcher();

        const postStartupResult = runPostStartupCallbacks(bundleResult);
        if (postStartupResult) return postStartupResult;

        // Wait until another file changes.
        ret = oldPromise.await();
      }
    } finally {
      self.runPromise = null;

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

  _fiber: function () {
    var self = this;

    var crashCount = 0;
    var crashTimer = null;
    var firstRun = true;

    while (true) {

      var resetCrashCount = function () {
        crashTimer = setTimeout(function () {
          crashCount = 0;
        }, 8000);
      };

      var runResult = self._runOnce({
        onListen: function () {
          if (! self.noRestartBanner && ! firstRun) {
            runLog.logRestart();
            Console.enableProgressDisplay(false);
          }
        },
        beforeRun: resetCrashCount,
        firstRun: firstRun
      });
      firstRun = false;

      clearTimeout(crashTimer);
      if (runResult.outcome !== "terminated") {
        crashCount = 0;
      }

      var wantExit = self.onRunEnd ? !self.onRunEnd(runResult) : false;
      if (wantExit || self.exitPromise || runResult.outcome === "stopped") {
        break;
      }

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

      else if (runResult.outcome === "changed") {
        continue;
      } else if (runResult.outcome === "terminated") {
        if (runResult.signal) {
          runLog.log('Exited from signal: ' + runResult.signal, { arrow: true });
        } else if (runResult.code !== undefined) {
          runLog.log('Exited with code: ' + runResult.code, { arrow: true });
        } else {
          // explanation should already have been logged
        }

        crashCount ++;
        if (crashCount < 3) {
          continue;
        }

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
        self.watchPromise = self._makePromise("watch");

        if (!runResult.watchSet) {
          throw Error("watching for changes with no watchSet?");
        }
        // XXX reference to watcher is lost later?
        var watcher = new watch.Watcher({
          watchSet: runResult.watchSet,
          onChange: function () {
            self._resolvePromise("watch");
          }
        });
        self.proxy.setMode("errorpage");
        // If onChange wasn't called synchronously (clearing watchPromise), wait
        // on it.
        self.watchPromise && self.watchPromise.await();
        // While we were waiting, did somebody stop() us?
        if (self.exitPromise) {
          break;
        }
        runLog.log("Modified -- restarting.",  { arrow: true });
        Console.enableProgressDisplay(true);
        continue;
      }

      break;
    }

    // Allow the process to exit normally, since optimistic file watchers
    // may be keeping the event loop busy.
    closeAllWatchers();

    // Giving up for good.
    self._cleanUpPromises();

    self.fiber = null;
  }
});

///////////////////////////////////////////////////////////////////////////////

exports.AppRunner = AppRunner;
