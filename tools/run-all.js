var _ = require('underscore');
var Future = require('fibers/future');
var Fiber = require('fibers');
var files = require('./files.js');
var inFiber = require('./fiber-helpers.js').inFiber;

var RunLog = require('./run-log.js').RunLog;
var Proxy = require('./run-proxy.js').Proxy;
var AppRunner = require('./run-app.js').AppRunner;
var MongoRunner = require('./run-mongo.js').MongoRunner;
var Updater = require('./run-updater.js').Updater;


///////////////////////////////////////////////////////////////////////////////
// XXX XXX NEXT (if you want to do more):
//
// - make files.getSettings return errors instead of throwing (or eliminate)
// - deal with XXX's in updater about it needing to go though runlog since
//   no more stdout redirection
// - auth stuff: log into galaxies automatically, reprompt for expired
//   credentials..
// - deal with options last on command line without args being tolerated
// - clean up argument parsing? require that only --release appear to
//   the left of the command, and do parsing in two phases.. but how
//   does this solve --release appearing after the command? well,
//   anyway, at least write a comment about what we'd like to do and
//   when we want to do it.
//
///////////////////////////////////////////////////////////////////////////////

// options: port, buildOptions, settingsFile, banner, program,
// onRunEnd, onFailure, watchForChanges, quiet, rootUrl, mongoUrl,
// oplogUrl, disableOplog, rawLogs, appDirForVersionCheck
var Runner = function (appDir, options) {
  var self = this;
  self.appDir = appDir;

  if (! _.has(options, 'port'))
    throw new Error("no port?");

  var listenPort = options.port;
  var appPort = listenPort + 1;
  var mongoPort = listenPort + 2;

  self.stopped = false;
  self.quiet = options.quiet;
  self.banner = options.banner || files.prettyPath(self.appDir);
  self.rootUrl = options.rootUrl || ('http://localhost:' + listenPort + '/');

  self.runLog = new RunLog({
    rawLogs: options.rawLogs
  });

  self.proxy = new Proxy({
    listenPort: listenPort,
    proxyToPort: appPort,
    runLog: self.runLog,
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
      runLog: self.runLog,
      onFailure: options.onFailure
    });

    mongoUrl = "mongodb://127.0.0.1:" + mongoPort + "/meteor";
    oplogUrl = (options.disableOplog ? null :
                "mongodb://127.0.0.1:" + mongoPort + "/local");
  }

  self.updater = new Updater;

  self.appRunner = new AppRunner(appDir, {
    appDirForVersionCheck: options.appDirForVersionCheck,
    port: appPort,
    mongoUrl: mongoUrl,
    oplogUrl: oplogUrl,
    buildOptions: options.buildOptions,
    rootUrl: self.rootUrl,
    settingsFile: options.settingsFile,
    program: options.program,
    proxy: self.proxy,
    runLog: self.runLog,
    onRunEnd: options.onRunEnd,
    watchForChanges: options.watchForChanges,
    noRestartBanner: self.quiet
  });
};

_.extend(Runner.prototype, {
  // XXX leave a pidfile and check if we are already running
  start: function (onFailure) {
    var self = this;
    self.onFailure = onFailure;
    self.proxy.start();

    // print the banner only once we've successfully bound the port
    if (! self.quiet) {
      process.stdout.write("[[[[[ " + self.banner + " ]]]]]\n\n");
      process.stderr.write("=> Started proxy.\n");
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
          self.runLog.logTemporary("=> Starting MongoDB... " +
                                   spinner[animationFrame]);
          animationFrame = (animationFrame + 1) % spinner.length;
        };
        printUpdate();
        var mongoProgressTimer = setInterval(printUpdate, 200);
      }

      self.mongoRunner.start();

      if (! self.quiet) {
        clearInterval(mongoProgressTimer);
        self.runLog.log("=> Started MongoDB.");
      }
    }

    if (! self.stopped) {
      if (! self.quiet)
        self.runLog.logTemporary("=> Starting your app...\r");
      self.appRunner.start();
      if (! self.quiet && ! self.stopped)
        self.runLog.log("=> Started your app.");
    }

    if (! self.stopped && ! self.quiet)
      self.runLog.log("\n=> App running at: " + self.rootUrl);

    // XXX It'd be nice to (cosmetically) handle failure better. Right
    // now we overwrite the "starting foo..." message with the
    // error. It'd be better to overwrite it with "failed to start
    // foo" and then print the error.
  },

  // Idempotent
  stop: function () {
    var self = this;
    self.stopped = true;
    self.proxy.stop();
    self.updater.stop();
    self.mongoRunner && self.mongoRunner.stop();
    self.appRunner.stop();
    self.runLog.finish();
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
// - rawLogs: don't colorize/beautify log messages that are printed
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
  var fut = new Future;

  var runOptions = _.clone(options);
  var once = runOptions.once;
  delete runOptions.once;

  _.extend(runOptions, {
    onFailure: function () {
      fut['return']({ outcome: 'failure' });
    },
    onRunEnd: function (result) {
      if (once ||
          result.outcome === "wrong-release" ||
          (result.outcome === "terminated" &&
           result.signal === undefined && result.code === undefined)) {
        runner.stop();
        fut['return'](result);
        return false;
      }
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
