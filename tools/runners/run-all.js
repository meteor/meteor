const _ = require('underscore');
const Fiber = require('fibers');
const Future = require('fibers/future');

const files = require('../fs/files.js');
const buildmessage = require('../utils/buildmessage.js');
const runLog = require('./run-log.js');
const release = require('../packaging/release.js');

const Console = require('../console/console.js').Console;

const Proxy = require('./run-proxy.js').Proxy;
const Selenium = require('./run-selenium.js').Selenium;
const AppRunner = require('./run-app.js').AppRunner;
const MongoRunner = require('./run-mongo.js').MongoRunner;
const Updater = require('./run-updater.js').Updater;

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
    self.quiet = quiet;
    self.banner = banner || files.convertToOSPath(
      files.prettyPath(self.projectContext.projectDir)
    );

    if (rootUrl) {
      self.rootUrl = rootUrl;
    } else if (proxyHost) {
      self.rootUrl = 'http://' + proxyHost + ':' + listenPort + '/';
    } else {
      self.rootUrl = 'http://localhost:' + listenPort + '/';
    }

    self.proxy = new Proxy({
      listenPort,
      listenHost: proxyHost,
      proxyToPort: self.appPort,
      proxyToHost: appHost,
      onFailure
    });

    self.mongoRunner = null;
    if (mongoUrl) {
      oplogUrl = disableOplog ? null : oplogUrl;
    } else {
      self.mongoRunner = new MongoRunner({
        appDir: self.projectContext.projectDir,
        port: mongoPort,
        onFailure,
        // For testing mongod failover, run with 3 mongod if the env var is
        // set. Note that data is not preserved from one run to the next.
        multiple: !!process.env.METEOR_TEST_MULTIPLE_MONGOD_REPLSET
      });

      mongoUrl = self.mongoRunner.mongoUrl();
      oplogUrl = disableOplog ? null : self.mongoRunner.oplogUrl();
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
      cordovaRunner: cordovaRunner
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

    self._startMongoAsync();

    if (! self.stopped) {
      self.updater.start();
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
      runLog.log("App running at: " + self.rootUrl,  { arrow: true });

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

  _startMongoAsync() {
    const self = this;
    if (! self.stopped && self.mongoRunner) {
      const future = new Future;
      self.appRunner.awaitFutureBeforeStart(future);
      Fiber(function () {
        self.mongoRunner.start();
        if (! self.stopped && ! self.quiet) {
          runLog.log("Started MongoDB.",  { arrow: true });
        }
        // This future might also get resolved by appRunner.stop, so we need
        // this check here (which is why we can't use f.future(), which does not
        // have this check).
        future.isResolved() || future.return();
      }).run();
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
  delete runOptions.once;

  var fut = new Future;

  _.extend(runOptions, {
    onFailure: function () {
      // Ensure that runner stops now. You might think this is unnecessary
      // because the runner is stopped immediately after `fut.wait()`, but if
      // the failure happens while runner.start() is still running, we want the
      // rest of start to stop, and it's not like fut['return'] magically makes
      // us jump to a fut.wait() that hasn't happened yet!.
      runner.stop();
      fut.isResolved() || fut['return']({ outcome: 'failure' });
    },
    onRunEnd: function (result) {
      if (once ||
          result.outcome === "conflicting-versions" ||
          result.outcome === "wrong-release" ||
          result.outcome === "outdated-cordova-platforms" ||
          result.outcome === "outdated-cordova-plugins" ||
          (result.outcome === "terminated" &&
           result.signal === undefined && result.code === undefined)) {
        // Allow run() to continue (and call runner.stop()) only once the
        // AppRunner has processed our "return false"; otherwise we deadlock.
        process.nextTick(function () {
          fut.isResolved() || fut['return'](result);
        });
        return false;  // stop restarting
      }
      runner.regenerateAppPort();
      return true;  // restart it
    },
    watchForChanges: ! once,
    quiet: once
  });

  var runner = new Runner(runOptions);
  runner.start();
  var result = fut.wait();
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
