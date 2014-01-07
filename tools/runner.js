var _ = require('underscore');
var Future = require('fibers/future');
var Fiber = require('fibers');
var files = require('./files.js');
var inFiber = require('./fiber-helpers.js').inFiber;

var RunLog = require('./run-log.js').RunLog;
var Proxy = require('./run-proxy.js').Proxy;
var AppRunner = require('./run-app.js').AppRunner;
var MongoRunner = require('./run-mongo.js').MongoRunner;
var Updater = require('./updater.js').Updater;


///////////////////////////////////////////////////////////////////////////////
// XXX XXX NEXT (if you want to do more):
//
// - make bundler.bundle() not take a release (get it from the app!)
// - move mongo shell function from deploy.js into mongo-runner.js
// - add warnings to buildmessage, per slava
// - make files.getSettings return errors instead of throwing (or eliminate)
// - mv main.js to meteor.js
// - search for XXX here and there
//
///////////////////////////////////////////////////////////////////////////////

// options: port, buildOptions, settingsFile, banner, program,
// onRunEnd, onFailure, watchForChanges, noListenBanner, disableOplog,
// rawLogs, appDirForVersionCheck
var Runner = function (appDir, options) {
  var self = this;
  self.appDir = appDir;

  if (! _.has(options, 'port'))
    throw new Error("no port?");

  self.listenPort = options.port;
  self.appPort = self.listenPort + 1;
  self.mongoPort = self.listenPort + 2;

  // XXX XXX have this be passed in, not slurped from the environment
  self.rootUrl =
    var rootUrl = process.env.ROOT_URL ||
    ('http://localhost:' + self.listenPort + '/');

  self.banner = options.banner || files.prettyPath(self.appDir);

  self.runLog = new RunLog({
    rawLogs: options.rawLogs
  });

  self.proxy = new Proxy({
    listenPort: self.listenPort,
    proxyToPort: self.appPort,
    runLog: self.runLog,
    onFailure: options.onFailure
  });

  self.mongoRunner = null;
  var mongoUrl, oplogUrl;
  if (_.has(options, 'mongoUrl')) {
    mongoUrl = options.mongoUrl;
    oplogUrl = options.disableOplog ? null : options.oplogUrl;
  } else {
    self.mongoRunner = new MongoRunner({
      appDir: self.appDir,
      port: self.mongoPort,
      runLog: self.runLog,
      onFailure: options.onFailure
    });

    mongoUrl = "mongodb://127.0.0.1:" + self.mongoPort + "/meteor";
    oplogUrl = (options.disableOplog ? null :
                "mongodb://127.0.0.1:" + self.mongoPort + "/local");
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
    runLog: self.runLog,
    onRunEnd: options.onRunEnd,
    watchForChanges: options.watchForChanges,
    noListenBanner: options.noListenBanner
  });
};

_.extend(Runner.prototype, function () {
  // XXX leave a pidfile and check if we are already running
  start: function (onFailure) {
    var self = this;
    self.onFailure = onFailure;
    self.proxy.start();

    // print the banner only once we've successfully bound the port
    process.stdout.write("[[[[[ " + self.banner + " ]]]]]\n\n");

    self.updater.start();
    self.mongoRunner && self.mongoRunner.start();
    self.appRunner.start();
  },

  stop: function () {
    var self = this;
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
  var runner = new Runner(appDir, options);
  var fut = new Future;

  var runOptions = _.clone(options);
  var once = options.once;
  delete options.once;

  _.extend(runOptions, {
    onFailure: function () {
      fut['return']({ outcome: 'failure' });
    },
    onRunEnd: function (result) {
      if (once || result.outcome === "wrong-release") {
        fut['return'](result);
        return false;
      }
    },
    watchForChanges: ! once,
    noListenBanner: once
  });

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

  if (result.outcome === "failure") {
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
