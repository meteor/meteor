var _ = require('underscore');
var Future = require('fibers/future');
var Fiber = require('fibers');
var files = require('./files.js');
var inFiber = require('./fiber-helpers.js').inFiber;
var release = require('./release.js');

var runLog = require('./run-log.js').runLog;
var Proxy = require('./run-proxy.js').Proxy;
var AppRunner = require('./run-app.js').AppRunner;
var MongoRunner = require('./run-mongo.js').MongoRunner;
var Updater = require('./run-updater.js').Updater;

// options: port, buildOptions, settingsFile, banner, program,
// onRunEnd, onFailure, watchForChanges, quiet, rootUrl, mongoUrl,
// oplogUrl, disableOplog, appDirForVersionCheck
var Runner = function (appDir, options) {
  var self = this;
  self.appDir = appDir;

  if (! _.has(options, 'port'))
    throw new Error("no port?");

  var listenPort = options.port;
  var mongoPort = listenPort + 1;
  self.specifiedAppPort = options.appPort;
  self.regenerateAppPort();

  self.stopped = false;
  self.quiet = options.quiet;
  self.banner = options.banner || files.prettyPath(self.appDir);
  self.rootUrl = options.rootUrl || ('http://localhost:' + listenPort + '/');

  self.proxy = new Proxy({
    listenPort: listenPort,
    proxyToPort: self.appPort,
    onFailure: options.onFailure
  });

  self.mongoRunner = null;
  var mongoUrl, oplogUrl;
  if (options.mongoUrl) {
    mongoUrl = options.mongoUrl;
    oplogUrl = options.disableOplog ? null : options.oplogUrl;
  } else {
    self.mongoRunner = new MongoRunner({
      appDir: self.appDir,
      port: mongoPort,
      onFailure: options.onFailure
    });

    mongoUrl = "mongodb://127.0.0.1:" + mongoPort + "/meteor";
    oplogUrl = (options.disableOplog ? null :
                "mongodb://127.0.0.1:" + mongoPort + "/local");
  }

  self.updater = new Updater;

  self.appRunner = new AppRunner(appDir, {
    appDirForVersionCheck: options.appDirForVersionCheck,
    port: self.appPort,
    mongoUrl: mongoUrl,
    oplogUrl: oplogUrl,
    buildOptions: options.buildOptions,
    rootUrl: self.rootUrl,
    settingsFile: options.settingsFile,
    program: options.program,
    proxy: self.proxy,
    onRunEnd: options.onRunEnd,
    watchForChanges: options.watchForChanges,
    noRestartBanner: self.quiet
  });
};

_.extend(Runner.prototype, {
  // XXX leave a pidfile and check if we are already running
  start: function () {
    var self = this;
    self.proxy.start();

    // print the banner only once we've successfully bound the port
    if (! self.quiet & ! self.stopped) {
      runLog.log("[[[[[ " + self.banner + " ]]]]]\n");
      runLog.log("=> Started proxy.");
    }

    if (! self.stopped) {
      self.updater.start();
    }

    if (! self.stopped && self.mongoRunner) {
      var spinner = ['-', '\\', '|', '/'];
      // I looked at some Unicode indeterminate progress indicators, such as:
      //
      // spinner = "▁▃▄▅▆▇▆▅▄▃".split('');
      // spinner = "▉▊▋▌▍▎▏▎▍▌▋▊▉".split('');
      // spinner = "▏▎▍▌▋▊▉▊▋▌▍▎▏▁▃▄▅▆▇▆▅▄▃".split('');
      // spinner = "▉▊▋▌▍▎▏▎▍▌▋▊▉▇▆▅▄▃▁▃▄▅▆▇".split('');
      // spinner = "⠉⠒⠤⣀⠤⠒".split('');
      //
      // but none of them really seemed like an improvement. I think
      // the case for using unicode would be stronger in a determinate
      // progress indicator.
      //
      // There are also some four-frame options such as ◐◓◑◒ at
      //   http://stackoverflow.com/a/2685827/157965
      // but all of the ones I tried look terrible in the terminal.
      if (! self.quiet) {
        var animationFrame = 0;
        var printUpdate = function () {
          runLog.logTemporary("=> Starting MongoDB... " +
                              spinner[animationFrame]);
          animationFrame = (animationFrame + 1) % spinner.length;
        };
        printUpdate();
        var mongoProgressTimer = setInterval(printUpdate, 200);
      }

      self.mongoRunner.start();

      if (! self.quiet) {
        clearInterval(mongoProgressTimer);
        if (! self.stopped)
          runLog.log("=> Started MongoDB.");
      }
    }

    if (! self.stopped) {
      if (! self.quiet)
        runLog.logTemporary("=> Starting your app...");
      self.appRunner.start();
      if (! self.quiet && ! self.stopped)
        runLog.log("=> Started your app.");
    }

    if (! self.stopped && ! self.quiet)
      runLog.log("\n=> App running at: " + self.rootUrl);

    // XXX It'd be nice to (cosmetically) handle failure better. Right
    // now we overwrite the "starting foo..." message with the
    // error. It'd be better to overwrite it with "failed to start
    // foo" and then print the error.
  },

  // Idempotent
  stop: function () {
    var self = this;
    if (self.stopped)
      return;

    self.stopped = true;
    self.proxy.stop();
    self.updater.stop();
    self.mongoRunner && self.mongoRunner.stop();
    self.appRunner.stop();
    // XXX does calling this 'finish' still make sense now that runLog is a
    // singleton?
    runLog.finish();
  },

  // Call this whenever you want to regenerate the app's port (if it is not
  // explicitly specified by the user).
  //
  // Rationale: if we randomly chose a port that's in use and the app failed to
  // listen on it, we should try a different port when we restart the app!
  regenerateAppPort: function () {
    var self = this;
    if (self.specifiedAppPort) {
      self.appPort = self.specifiedAppPort;
    } else {
      self.appPort = require('./utils.js').randomPort();
    }
    if (self.proxy)
      self.proxy.proxyToPort = self.appPort;
    if (self.appRunner)
      self.appRunner.port = self.appPort;
  }
});

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
// - port: the port to connect to to access the application (we will
//   run a proxy here that proxies to the actual app process). required
// - buildOptions: 'buildOptions' argument to bundler.bundle()
// - settingsFile: path to file containing deploy-time settings
// - program: the program in the app bundle to run
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
// - appDirForVersionCheck: when checking whether we're running the
//   right release of Meteor, check against this app rather than
//   appDir. Useful when you have autogenerated a test harness app
//   based on some other app.
exports.run = function (appDir, options) {
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
          result.outcome === "wrong-release" ||
          (result.outcome === "terminated" &&
           result.signal === undefined && result.code === undefined)) {
        runner.stop();
        fut.isResolved() || fut['return'](result);
        return false;  // stop restarting
      }
      runner.regenerateAppPort();
      return true;  // restart it
    },
    watchForChanges: ! once,
    quiet: once
  });

  var runner = new Runner(appDir, runOptions);
  runner.start();
  var result = fut.wait();
  runner.stop();

  if (result.outcome === "wrong-release") {
    if (once)
      // We lost a race where the user ran 'meteor update' and 'meteor
      // run --once' simultaneously.
      throw new Error("wrong release?");

    // If the user did not specify a --release on the command line,
    // and simultaneously runs `meteor update` during this run, just
    // exit and let them restart the run. (We can do something fancy
    // like allowing this to work if the tools version didn't change,
    // or even springboarding if the tools version does change, but
    // this (which prevents weird errors) is a start.)
    var to = result.releaseNeeded;
    var from = release.current.name;
    process.stderr.write(
"Your app has been updated to Meteor " + to + " from " + "Meteor " + from +
".\n" +
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
    process.stderr.write("=> Build failed:\n\n" +
                         result.bundleResult.errors.formatMessages() + "\n");
    return 254;
  }

  if (once && result.outcome === "terminated") {
    if (result.signal) {
      process.stderr.write("Killed (" + result.signal + ")\n");
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
