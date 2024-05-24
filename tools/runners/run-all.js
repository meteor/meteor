const _ = require('underscore');

const files = require('../fs/files');
const buildmessage = require('../utils/buildmessage.js');
const utils = require('../utils/utils.js');
const runLog = require('./run-log.js');
const release = require('../packaging/release.js');

const Console = require('../console/console.js').Console;
const crypto = require('crypto');

const Proxy = require('./run-proxy.js').Proxy;
const Selenium = require('./run-selenium.js').Selenium;
const AppRunner = require('./run-app.js').AppRunner;
const MongoRunner = require('./run-mongo.js').MongoRunner;
const HMRServer = require('./run-hmr').HMRServer;
const Updater = require('./run-updater').Updater;

class Runner {
  constructor({
    appHost,
    appPort,
    banner,
    disableOplog,
    cordovaRunner,
    mongoUrl,
    onFailure,
    oplogUrl,
    projectContext,
    proxyHost,
    proxyPort,
    quiet,
    rootUrl,
    selenium,
    seleniumBrowser,
    noReleaseCheck,
    cordovaServerPort,
    ...optionsForAppRunner
  }) {
    const self = this;
    self.projectContext = projectContext;

    if (typeof proxyPort === 'undefined') {
      throw new Error('no proxyPort?');
    }

    const listenPort = proxyPort;
    const mongoPort = parseInt(listenPort, 10) + 1;
    self.specifiedAppPort = appPort;
    self.regenerateAppPort();

    self.stopped = false;
    self.noReleaseCheck = noReleaseCheck;
    self.quiet = quiet;
    self.banner = banner || files.convertToOSPath(
      files.prettyPath(self.projectContext.projectDir)
    );

    if (rootUrl) {
      self.rootUrl = rootUrl;
    } else {
      self.rootUrl = utils.formatUrl({
        protocol: 'http',
        hostname: proxyHost || "localhost",
        port: listenPort,
      });
    }

    const basePath = utils.parseUrl(self.rootUrl).pathname || '';
    const HMRPath = basePath + '/__meteor__hmr__/websocket';

    self.proxy = new Proxy({
      listenPort,
      listenHost: proxyHost,
      proxyToPort: self.appPort,
      proxyToHost: appHost,
      onFailure,
      ignoredUrls: [HMRPath]
    });

    buildmessage.capture(function () {
      self.projectContext.resolveConstraints();
    });

    const packageMap = self.projectContext.packageMap;
    const hasMongoDevServerPackage =
      packageMap && packageMap.getInfo('mongo-dev-server') != null;
    self.mongoRunner = null;
    if (mongoUrl) {
      oplogUrl = disableOplog ? null : oplogUrl;
    } else if (hasMongoDevServerPackage
        || process.env.METEOR_TEST_FAKE_MONGOD_CONTROL_PORT) {
      // The mongo-dev-server package is required to start Mongo, but
      // tests using fake-mongod are exempted.
      self.mongoRunner = new MongoRunner({
        projectLocalDir: self.projectContext.projectLocalDir,
        port: mongoPort,
        onFailure,
        // For testing mongod failover, run with 3 mongod if the env var is
        // set. Note that data is not preserved from one run to the next.
        multiple: !!process.env.METEOR_TEST_MULTIPLE_MONGOD_REPLSET
      });

      mongoUrl = self.mongoRunner.mongoUrl();
      oplogUrl = disableOplog ? null : self.mongoRunner.oplogUrl();
    } else {
      // Don't start a mongodb server.
      // Set monogUrl to a specific value to prevent MongoDB connections
      // and to allow a check for printing a message if `mongo-dev-server`
      // is added while the app is running.
      // The check and message is printed by the `mongo-dev-server` package.
      mongoUrl = 'no-mongo-server';
    }

    const hasHotModuleReplacementPackage = packageMap &&
      packageMap.getInfo('hot-module-replacement') != null;
    self.hmrServer = null;
    let hmrSecret = null;
    if (hasHotModuleReplacementPackage) {
      hmrSecret = crypto.randomBytes(64).toString('hex');
      self.hmrServer = new HMRServer({
        proxy: self.proxy,
        hmrPath: HMRPath,
        secret: hmrSecret,
        projectContext: self.projectContext,
        cordovaServerPort
      });
    }

    self.updater = new Updater();

    self.appRunner = new AppRunner({
      ...optionsForAppRunner,
      projectContext: self.projectContext,
      port: self.appPort,
      listenHost: appHost,
      mongoUrl,
      oplogUrl,
      rootUrl: self.rootUrl,
      proxy: self.proxy,
      noRestartBanner: self.quiet,
      cordovaRunner: cordovaRunner,
      hmrServer: self.hmrServer,
      hmrSecret
    });

    self.selenium = null;
    if (selenium) {
      self.selenium = new Selenium({
        runner: self,
        browser: seleniumBrowser
      });
    }
  }

  // XXX leave a pidfile and check if we are already running
  start() {
    const self = this;

    self.proxy.start();

    // print the banner only once we've successfully bound the port
    if (! self.quiet && ! self.stopped) {
      runLog.log("[[[[[ " + self.banner + " ]]]]]\n");
      runLog.log("Started proxy.",  { arrow: true });
    }

    var unblockAppRunner = self.appRunner.makeBeforeStartPromise();

    function startMongo(tries = 3) {
      self._startMongoAsync().then(
        ok => unblockAppRunner(),
        error => {
          --tries;
          const left = tries + (tries === 1 ? " try" : " tries");
          Console.error(
            `Error starting Mongo (${left} left): ${error.message}`
          );

          if (tries > 0) {
            self.mongoRunner.stop();
            setTimeout(() => startMongo(tries), 1000);
          } else {
            self.mongoRunner._fail();
          }
        }
      );
    }

    startMongo();

    if (!self.noReleaseCheck && ! self.stopped) {
      self.updater.start();
    }

    if (!self.stopped && self.hmrServer) {
      self.hmrServer.start();

      if (!self.quiet && !self.stopped) {
        runLog.log("Started HMR server.", { arrow: true });
      }
    }

    if (! self.stopped) {
      buildmessage.enterJob({ title: "starting your app" }, function () {
        self.appRunner.start();
      });
      if (! self.quiet && ! self.stopped) {
        runLog.log("Started your app.",  { arrow: true });
      }
    }

    if (! self.stopped && ! self.quiet) {
      runLog.log("");
      if (process.env.UNIX_SOCKET_PATH) {
        runLog.log(
          `App running; UNIX domain socket: ${process.env.UNIX_SOCKET_PATH}`,
          { arrow: true }
        );
      } else {
        runLog.log("App running at: " + self.rootUrl,  { arrow: true });
      }

      if (process.platform === "win32") {
        runLog.log("   Type Control-C twice to stop.");
        runLog.log("");
      }
    }

    if (self.selenium && ! self.stopped) {
      buildmessage.enterJob({ title: "starting Selenium" }, function () {
        self.selenium.start();
      });
      if (! self.quiet && ! self.stopped) {
        runLog.log("Started Selenium.", { arrow: true });
      }
    }

    // XXX It'd be nice to (cosmetically) handle failure better. Right
    // now we overwrite the "starting foo..." message with the
    // error. It'd be better to overwrite it with "failed to start
    // foo" and then print the error.
  }

  async _startMongoAsync() {
    if (! this.stopped && this.mongoRunner) {
      this.mongoRunner.start();
      if (! this.stopped && ! this.quiet) {
        runLog.log("Started MongoDB.", { arrow: true });
      }
    }
  }

  // Idempotent
  stop() {
    const self = this;
    if (self.stopped) {
      return;
    }

    self.stopped = true;
    self.proxy.stop();
    self.updater.stop();
    self.mongoRunner && self.mongoRunner.stop();
    self.appRunner.stop();
    self.selenium && self.selenium.stop();
    // XXX does calling this 'finish' still make sense now that runLog is a
    // singleton?
    runLog.finish();
  }

  // Call this whenever you want to regenerate the app's port (if it is not
  // explicitly specified by the user).
  //
  // Rationale: if we randomly chose a port that's in use and the app failed to
  // listen on it, we should try a different port when we restart the app!
  regenerateAppPort() {
    const self = this;
    if (self.specifiedAppPort) {
      self.appPort = self.specifiedAppPort;
    } else {
      self.appPort = require('../utils/utils.js').randomPort();
    }
    if (self.proxy) {
      self.proxy.proxyToPort = self.appPort;
    }
    if (self.appRunner) {
      self.appRunner.port = self.appPort;
    }
  }
}

// Run the app and all of its associated processes. Runs (and does not
// return) until an unrecoverable failure happens. Logs to
// stdout. Returns a suggested exit code.
//
// If 'once' is set, run the app process exactly once and pass through
// its exit code. Return an exit code of 255 if the app process was
// killed by a signal and 254 if the app process could not start
// (build failure, invalid program name, database couldn't start, and
// so on).
//
// If the 'once' option is not set, the default, restart the app
// process if it crashes or if source files change. (Non-app
// processes, such as the database, are always restarted as
// necessary.) The function will only return if there is an
// unrecoverable error, which generally means an error that could not
// be fixed by source code changes (such as the database refusing to
// run), but also currently includes Meteor version mismatches. So the
// exit code will always be 254 because in all other cases we'll
// persevere.
//
// Options:
//
// - proxyPort: the port to connect to to access the application (we will
//   run a proxy here that proxies to the actual app process). required
// - buildOptions: 'buildOptions' argument to bundler.bundle()
// - settingsFile: path to file containing deploy-time settings
// - once: see above
// - onBuilt: callback to call when the app bundle is built
// - banner: replace the application path that is normally printed on
//   startup with an arbitrary string (eg, 'Tests')
// - rootUrl: tell the app that traffic at this URL will be routed to
//   it at '/' (used by the app to construct absolute URLs)
// - disableOplog: don't use oplog tailing
// - mongoUrl: don't start a mongo process; instead use the mongo at
//   this mongo URL
// - oplogUrl: URL of the mongo oplog to use. if mongoUrl isn't
//   set (we're starting a mongo) a default will be provided, but can
//   be overridden. if mongoUrl is set, you must set this or you don't
//   get oplog tailing.
// - recordPackageUsage: (default true) if set to false, don't send
//   information about packages used by this app to the package stats
//   server.
exports.run = function (options) {
  var runOptions = _.clone(options);
  var once = runOptions.once;
  var onBuilt = runOptions.onBuilt;

  var promise = new Promise(function (resolve) {
    runOptions.onFailure = function () {
      // Ensure that runner stops now. You might think this is unnecessary
      // because the runner is stopped immediately after promise.await(), but if
      // the failure happens while runner.start() is still running, we want the
      // rest of start to stop, and it's not like resolve() magically makes
      // us jump to a promise.await() that hasn't happened yet!.
      runner.stop();
      resolve({ outcome: 'failure' });
    };

    runOptions.onRunEnd = function (result) {
      if (once ||
          result.outcome === "conflicting-versions" ||
          result.outcome === "wrong-release" ||
          result.outcome === "outdated-cordova-platforms" ||
          result.outcome === "outdated-cordova-plugins" ||
          (result.outcome === "terminated" &&
           result.signal === undefined && result.code === undefined)) {
        resolve(result);
        return false;  // stop restarting
      }
      runner.regenerateAppPort();
      return true;  // restart it
    };
  });

  runOptions.watchForChanges = ! once;
  runOptions.quiet = false;

  // Ensure process.env.NODE_ENV matches the build mode, with the following precedence:
  // 1. Passed in build mode (if development or production)
  // 2. Existing process.env.NODE_ENV (if it's valid)
  // 3. Default to development (in both cases) otherwise

  // NOTE: because this code only runs when using `meteor run` or `meteor test[-packages`,
  // We *don't* end up defaulting NODE_ENV in this way when bundling/deploying.
  // In those cases, it will default to "production" in packages/meteor/*_env.js

  // We *override* NODE_ENV if build mode is one of these values
  let buildMode = runOptions.buildOptions.buildMode;
  if (buildMode === "development" || buildMode === "production") {
    process.env.NODE_ENV = buildMode;
  }

  let nodeEnv = process.env.NODE_ENV;
  // We *never* override buildMode (it can be "test")
  if (!buildMode) {
    if (nodeEnv === "development" || nodeEnv === "production") {
      runOptions.buildOptions.buildMode = nodeEnv;
    } else {
      runOptions.buildOptions.buildMode = "development";
    }
  }

  if (!nodeEnv) {
    process.env.NODE_ENV = "development";
  }

  var runner = new Runner(runOptions);
  runner.start();
  onBuilt && onBuilt();
  var result = promise.await();
  runner.stop();

  if (result.outcome === "conflicting-versions") {
    Console.error(
      "The constraint solver could not find a set of package versions to",
      "use that would satisfy the constraints of .meteor/versions and",
      ".meteor/packages. This could be caused by conflicts in",
      ".meteor/versions, conflicts in .meteor/packages, and/or",
      "inconsistent changes to the dependencies in local packages.");
    return 254;
  }

  if (result.outcome === "outdated-cordova-plugins") {
    Console.error("Your app's Cordova plugins have changed.");
    Console.error("Restart meteor to use the new set of plugins.");
    return 254;
  }

  if (result.outcome === "outdated-cordova-platforms") {
    Console.error("Your app's platforms have changed.");
    Console.error("Restart meteor to use the new set of platforms.");
    return 254;
  }

  if (result.outcome === "wrong-release") {
    if (once) {
      // We lost a race where the user ran 'meteor update' and 'meteor
      // run --once' simultaneously.
      throw new Error("wrong release?");
    }

    // If the user did not specify a --release on the command line,
    // and simultaneously runs `meteor update` during this run, just
    // exit and let them restart the run. (We can do something fancy
    // like allowing this to work if the tools version didn't change,
    // or even springboarding if the tools version does change, but
    // this (which prevents weird errors) is a start.)
    var from = release.current.getDisplayName();
    var to = result.displayReleaseNeeded;
    Console.error(
      "Your app has been updated to " + to + " from " + from + ".",
      "Restart meteor to use the new release.");
    return 254;
  }

  if (result.outcome === "failure" ||
      (result.outcome === "terminated" &&
       result.signal === undefined && result.code === undefined)) {
    // Fatal problem with something other than the app process. An
    // explanation should already have been logged.
    return 254;
  }

  if (once && result.outcome === "bundle-fail") {
    Console.arrowError("Build failed:\n\n" +
                       result.errors.formatMessages());
    return 254;
  }

  if (once && result.outcome === "terminated") {
    if (result.signal) {
      Console.error("Killed (" + result.signal + ")");
      return 255;
    } else if (typeof result.code === "number") {
      // We used to print 'Your application is exiting' here, but that
      // seems unnecessarily chatty? once mode is otherwise silent
      return result.code;
    } else {
      // If there is neither a code nor a signal, it means that we
      // failed to start the process. We logged the reason. Probably a
      // bad program name.
      return 254;
    }
  }

  throw new Error("unexpected outcome " + result.outcome);
};
