var fs = require("fs");
var path = require("path");
var _ = require('underscore');
var Future = require('fibers/future');
var Fiber = require('fibers');
var files = require('./files.js');
var watch = require('./watch.js');
var project = require('./project.js');
var bundler = require('./bundler.js');
var mongoRunner = require('./mongo-runner.js');
var mongoExitCodes = require('./mongo-exit-codes.js');
var unipackage = require('./unipackage.js');
var release = require('./release.js');
var inFiber = require('./fiber-helpers.js').inFiber;

// XXX XXX just suck it up and replace setTimeout and clearTimeout,
// globally, with fiberized versions? will this mess up npm modules?


// XXX XXX NEXT (if you want to do more):

// - make bundler.bundle() not take a release (get it from the app!)
//   - but don't do this until you merge andrew's stuff
// - move mongo shell function from deploy.js into mongo-runner.js
// - possibly fold the mongo restart logic into the mongo-runner.js
// - break each thing out into a separate file.. run-proxy, run-app,
//   run-updater, run-mongo..
// - if really feeling ambitious, get rid of process.exit everywhere
//   (and/or make everything use the logger instead of stdout/stderr?)
// - turn the whole thing into a local galaxy emulator! the prize here
//   is when you manage to run the app dashboard locally (in an in-app
//   overlay a la Django Dashboard).

var runner = exports;

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

// Also used by "meteor deploy" in meteor.js.
// XXX move this into 'files', and make it return structured errors
// instead of throwing
runner.getSettings = function (filename, watchSet) {
  var absPath = path.resolve(filename);
  var buffer = watch.readAndWatchFile(watchSet, absPath);
  if (!buffer)
    throw new Error("Could not find settings file " + filename);
  if (buffer.length > 0x10000)
    throw new Error("Settings file must be less than 64 KB long");

  var str = buffer.toString('utf8');

  // Ensure that the string is parseable in JSON, but there's no reason to use
  // the object value of it yet.
  if (str.match(/\S/)) {
    JSON.parse(str);
    return str;
  } else {
    return "";
  }
};

var getLoggingPackage = _.once(function () {
  var Log = unipackage.load({
    library: release.current.library,
    packages: ['logging']
  }).logging.Log;

  // Since no other process will be listening to stdout and parsing it,
  // print directly in the same format as log messages from other apps
  Log.outputFormat = 'colored-text';

  return Log;
});

// XXX make this function go away
var die = function (message) {
  process.stderr.write(message);
  process.exit(1);
};

///////////////////////////////////////////////////////////////////////////////
// Logger
///////////////////////////////////////////////////////////////////////////////

// options: rawLogs
var Logger = function (options) {
  var self = this;

  self.rawLogs = options.rawLogs;

  self.log = []; // list of log objects
  self.maxLength = 100;

  // If non-null, the last thing logged was "server restarted"
  // message, and teh value will be the number of consecutive such
  // messages that have been logged with no other intervening messages
  self.consecutiveRestartMessages = null;
};

_.extend(Logger.prototype, {
  _record: function (msg) {
    var self = this;

    self.log.push(msg);
    if (self.log.length > self.maxLength) {
      self.log.shift();
    }
  },

  logAppOutput: function (line, isStderr) {
    if (line.trim().length === 0)
      return;

    var Log = getLoggingPackage();

    var obj = (isStderr ?
               Log.objFromText(line, { level: 'warn', stderr: true }) :
               Log.parse(line) || Log.objFromText(line));
    self._record(obj);

    if (self.consecutiveRestartMessages) {
      self.consecutiveRestartMessages = null;
      process.stdout.write("\n");
    }

    if (self.rawLogs)
      process[isStderr ? "stderr" : "stdout"].write(line + "\n");
    else
      process.stdout.write(Log.format(obj, { color: true }) + "\n");

    // XXX deal with test server logging differently?!
  },

  log: function (msg) {
    var self = this;

    var obj = {
      time: new Date,
      message: msg
      // in the future, might want to add something else to
      // distinguish messages from runner from message from the app,
      // but for now, nothing would use it, so we'll keep it simple
    };
    self._record(obj);

    if (self.consecutiveRestartMessages) {
      self.consecutiveRestartMessages = null;
      process.stdout.write("\n");
    }

    process.stdout.write(msg + "\n");
  },

  logRestart: function () {
    var self = this;

    if (self.consecutiveRestartMessages) {
      // replace old message in place
      process.stdout.write("\r");
      self.log.pop();
      self.consecutiveRestartMessages ++;
    } else {
      self.consecutiveRestartMessages = 1;
    }

    var message = "=> Meteor server restarted";
    if (self.consecutiveRestartMessages > 1)
      message += " (x" + self.consecutiveRestartMessages + ")";
    // no newline, so that we can overwrite it if we get another
    // restart message right after this one
    process.stdout.write(message);

    self.log(message);
  },

  clearLog: function () {
    var self = this;
    self.log = [];
  },

  getLog: function () {
    var self = this;
    return self.log;
  }
});

///////////////////////////////////////////////////////////////////////////////
// Proxy
///////////////////////////////////////////////////////////////////////////////

// options: listenPort, proxyToPort, onFailure, logger
var Proxy = function (options) {
  var self = this;

  self.listenPort = options.listenPort;
  self.proxyToPort = options.proxyToPort;
  self.onFailure = options.onFailure || function () {};
  self.logger = options.logger;

  self.mode = "hold";
  self.httpQueue = []; // keys: req, res
  self.websocketQueue = []; // keys: req, socket, head

  self.proxy = null;
  self.server = null;
};

_.extend(Proxy.prototype, {
  // Start the proxy server, block (yield) until it is ready to go
  // (actively listening on outer and proxying to inner), and then
  // return.
  start: function () {
    var self = this;

    if (self.server)
      throw new Error("already running?");

    var http = require('http');
    // Note: this uses the pre-release 1.0.0 API.
    var httpProxy = require('http-proxy');

    self.proxy = httpProxy.createProxyServer({
      // agent is required to handle keep-alive, and http-proxy 1.0 is a little
      // buggy without it: https://github.com/nodejitsu/node-http-proxy/pull/488
      agent: new http.Agent({ maxSockets: 100 }),
      xfwd: true
    });

    self.server = http.createServer(function (req, res) {
      // Normal HTTP request
      self.httpQueue.push({ req: req, res: res });
      self._tryHandleConnections();
    });

    self.server.on('upgrade', function (req, socket, head) {
      // Websocket connection
      self.websocketQueue.push({ req: req, socket: socket, head: head });
      self._tryHandleConnections();
    });

    self.server.on('error', function (err) {
      if (err.code == 'EADDRINUSE') {
        var port = self.listenPort;
        self.logger.log(
"Can't listen on port " + port + ". Perhaps another Meteor is running?\n" +
"\n" +
"Running two copies of Meteor in the same application directory\n" +
"will not work. If something else is using port " + port + ", you can\n" +
"specify an alternative port with --port <port>.");
      } else {
        self.logger.log('' + err);
      }
      self.onFailure();
    });

    // don't crash if the app doesn't respond. instead return an error
    // immediately. This shouldn't happen much since we try to not
    // send requests if the app is down.
    proxy.ee.on('http-proxy:outgoing:web:error', function (err, req, res) {
      res.writeHead(503, {
        'Content-Type': 'text/plain'
      });
      res.end('Unexpected error.');
    });
    proxy.ee.on('http-proxy:outgoing:ws:error', function (err, req, socket) {
      socket.end();
    });

    var fut = new Future;
    server.listen(listenPort, function () {
      fut['return']();
    });

    fut.wait();
  },

  stop: function () {
    var self = this;

    if (! self.server)
      throw new Error("not running?");

    // This stops listening but allows existing connections to
    // complete gracefully.
    self.server.close();
    self.server = null;

    // It doesn't seem to be necessary to do anything special to
    // destroy an httpProxy proxyserver object.
    self.proxy = null;

    // Drop any held connections.
    _.each(self.httpQueue, function (c) {
      c.res.statusCode = 500;
      c.res.end();
    });
    self.httpQueue = [];

    _.each(self.websocketQueue, function (c) {
      c.socket.destroy();
    });
    self.websocketQueue = [];

    self.mode = "hold";
  },

  _tryHandleConnections: function () {
    var self = this;

    while (self.httpQueue.length) {
      if (self.mode !== "errorpage" && self.mode !== "proxy")
        break;

      var c = self.httpQueue.shift();
      if (self.mode === "errorpage") {
        // XXX serve an app that shows the logs nicely and that also
        // knows how to reload when the server comes back up
        c.res.writeHead(200, {'Content-Type': 'text/plain'});
        c.res.write("Your app is crashing. Here's the latest log.\n\n");

        _.each(self.logger.getLog(), function (item) {
          c.res.write(item.message + "\n");
        });

        c.res.end();
      } else {
        self.proxy.web(c.req, c.res, {
          target: 'http://127.0.0.1:' + self.proxyToPort
        });
      }
    }

    while (self.websocketQueue.length) {
      if (self.mode !== "proxy")
        break;

      var c = self.websocketQueue.shift();
      self.proxy.ws(c.req, c.socket, c.head, {
        target: 'http://127.0.0.1:' + self.proxyToPort
      });
    }
  },

  // The proxy can be in one of three modes:
  // - "hold": hold connections until the mode changes
  // - "proxy": connections are proxied to the configured port
  // - "errorpage": an error page is served to HTTP connections, and
  //   websocket connections are held
  //
  // The initial mode is "hold".
  setMode: function (mode) {
    var self = this;
    self.mode = mode;
    self._tryHandleConnections();
  }
});

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
// Required options: bundlePath, port, rootUrl, mongoUrl, oplogUrl, logger
// Optional options: onExit, onListen, program, nodeOptions, settings

var AppProcess = function (options) {
  var self = this;

  self.bundlePath = options.bundlePath;
  self.port = options.port;
  self.rootUrl = options.rootUrl;
  self.oplogUrl = option.oplogUrl;
  self.logger = options.logger;

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
      self.logger.log("Program '" + self.program + "' not found.");

      if (! self.madeExitCallback)
        self.onExit && self.onExit();
      self.madeExitCallback = true;
    }

    // Send stdout and stderr to the logger
    var eachline = require('eachline');
    eachline(self.proc.stdout, 'utf8', function (line) {
      if (line.match(/^LISTENING\s*$/)) {
        // This is the child process telling us that it's ready to
        // receive connections.
        self.onListen && self.onListen();
      } else {
        self.logger.logAppOutput(line);
      }
    });

    eachline(self.proc.stderr, 'utf8', function (line) {
      self.logger.logAppOutput(line, true);
    });

    // Watch for exit
    proc.on('close', function (code, signal) {
      if (signal) {
        self.logger.log('=> Exited from signal: ' + signal);
      } else {
        self.logger.log('=> Exited with code: ' + code);
      }

      if (! self.madeExitCallback)
        self.onExit && self.onExit(code, signal);
      self.madeExitCallback = true;
    });

    proc.on('error', function (err) {
      self.logger.log("=> Couldn't spawn process: " + err.message);

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
// buildOptions, rootUrl, settingsFile, program, proxy, logger
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
  self.logger = options.logger;

  self.started = false;
  self.runFuture = null;
  self.exitFuture = null;
};

_.extend(AppRunner.prototype, {
  // Start the app running, and restart it as necessary. Returns
  // immediately.
  start: function () {
    var self = this;

    if (self.started)
      throw new Error("already started?");
    self.started = true;

    new Fiber(function () {
      self._fiber();
    }).run();
  },

  // Shut down the app. stop() will block until the app is shut
  // down. This may involve waiting for bundling to finish.
  stop: function () {
    var self = this;

    if (! self.started)
      throw new Error("not started?");

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

    self.logger.clearLog();

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
      settings = runner.getSettings(self.settingsFile, watchSet);

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
      logger: self.logger,
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

  _fiber: function () {
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
          self.logger.log("=> Meteor server running on: " + self.rootUrl +"\n");
          firstRun = false;
        } else {
          self.logger.logRestart();
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
        die(
"Your app has been updated to Meteor " + to + " from " + "Meteor " + from +
".\n" +
"Restart meteor to use the new release.\n");
      }

      if (runResult.outcome === "bundle-fail") {
        self.logger.log("=> Errors prevented startup:\n\n" +
                        runResult.bundleResult.errors.formatMessages());
        self.logger.log("=> Your application has errors. " +
                        "Waiting for file change.");
        self.proxy.setMode("errorpage");
        waitForChanges(runResult.bundleResult.watchSet);
        self.logger.log("=> Modified -- restarting.");
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
          self.logger.log("=> Your application is crashing. " +
                          "Waiting for file change.");
          waitForChanges(runResult.bundleResult.watchSet);
          self.logger.log("=> Modified -- restarting.");
        }

        continue;
      }

      throw new Error("unknown run outcome?");
    }
  }
});

///////////////////////////////////////////////////////////////////////////////
// Mongo
///////////////////////////////////////////////////////////////////////////////

// This runs a Mongo process and restarts it whenever it fails. If it
// restarts too often, we give up on restarting it, diagnostics are
// logged, and onFailure is called.
//
// options: appDir, port, logger, onFailure
var MongoRunner = function (options) {
  var self = this;

  self.appDir = options.appDir;
  self.port = options.port;
  self.logger = options.logger;
  self.onFailure = options.onFailure;

  self.handle = null;
  self.shuttingDown = false;
  self.startupFuture = null;

  self.errorCount = 0;
  self.errorTimer = null;
  self.startupPrintTimer = undefined;
};

_.extend(MongoRunner.prototype, {
  // Blocks (yields) until the server has started for the first time
  // and is accepting connections. (It might subsequently die and be
  // restarted; we won't tell you about that.)
  //
  // If the server fails to start for the first time (after a few
  // restarts), we will print a message and kill the program!
  //
  // XXX XXX this is a change in behavior -- before, whenever mongo
  // crashed we would restart the app. now they are independent. will
  // apps tolerate that, or will they die immediately on startup if
  // they can't make an initial database connection? we should look
  // into that ... but really, if you think about it, that's not the
  // right way for apps to behave in a HA environment, because there
  // is always a race where they fail to start (I suppose you could
  // take the position that they should be restarted if they fail,
  // after a short time delay.. but still, that approach will tend to
  // amplify failures)
  start: function () {
    var self = this;

    if (self.handle)
      throw new Error("already running?");

    self.startupPrintTimer = setTimeout(function () {
      process.stdout.write(
"Initializing mongo database... this may take a moment.\n");
    }, 5000);

    self.startupFuture = new Future;
    self._startOrRestart();
    self.startupFuture.wait();
  },

  _startOrRestart: function () {
    var self = this;

    if (self.handle)
      throw new Error("already running?");

    self.handle = mongoRunner.launchMongo({
      appDir: self.appDir,
      port: self.mongoPort,
      onExit: _.bind(self._exited, self);
      onListen: function () {
        // cancel 'mongo startup is slow' message if not already printed
        if (self.startupPrintTimer) {
          clearTimeout(self.startupPrintTimer);
          self.startupPrintTimer = null;
        }

        if (self.startupFuture) {
          // It's come up successfully for the first time. Make
          // start() return.
          self.startupFuture['return']();
          self.startupFuture = null;
        }
      }
    });
  },

  _exited: function (code, signal, stderr) {
    var self = this;
    self.handle = null;

    // If Mongo exited because (or rather, anytime after) we told it
    // to exit, great, nothing to do. Otherwise, we'll print an error
    // and try to restart.
    if (self.shuttingDown)
      return;

    // Print the last 20 lines of stderr.
    self.logger.log(
      stderr.split('\n').slice(-20).join('\n') +
      "Unexpected mongo exit code " + code + ". Restarting.\n");

    // We'll restart it up to 3 times in a row. The counter is reset
    // when 5 seconds goes without a restart. (Note that by using a
    // timer instead of looking at the current date, we avoid getting
    // confused by time changes.)
    self.errorCount ++;
    if (self.errorTimer)
      clearTimeout(self.errorTimer);
    self.errorTimer = setTimeout(function () {
      self.errorCount = 0;
    }, 5000);

    if (self.errorCount < 3) {
      // Wait a second, then restart.
      setTimeout(inFiber(function () {
        self._startOrRestart();
      }), 1000);
      return;
    }

    // Too many restarts, too quicky. It's dead. Print friendly
    // diagnostics and kill the program (!)
    var explanation = mongoExitCodes.Codes[code];
    var message = "Can't start mongod\n";

    if (explanation)
      message += "\n" + explanation.longText;

    if (explanation === mongoExitCodes.EXIT_NET_ERROR) {
      message += "\n\n" +
"Check for other processes listening on port " + self.mongoPort + "\n" +
"or other Meteor instances running in the same project.";
    }

    if (! explanation && /GLIBC/i.test(stderr)) {
      message += "\n\n" +
"Looks like you are trying to run Meteor on an old Linux distribution.\n" +
"Meteor on Linux requires glibc version 2.9 or above. Try upgrading your\n" +
"distribution to the latest version.";
    }

    self.logger.log(message);
    self.onFailure && self.onFailure();
  },

  // Idempotent
  stop: function () {
    var self = this;

    var fut = new Future;
    self.shuttingDown = true;
    self.handle.stop(function (err) { // XXX fiberize upstream?
      if (err)
        process.stdout.write(err.reason + "\n");
      fut['return']();
    });

    fut.wait();
    self.handle = null;
  }
});

///////////////////////////////////////////////////////////////////////////////
// Updater
///////////////////////////////////////////////////////////////////////////////

var Updater = function () {
  var self = this;
  self.timer = null;
};

// XXX make it take a logger?
// XXX need to deal with updater writing messages (bypassing old
// stdout interception.. maybe it should be global after all..)
_.extend(Updater.prototype, {
  start: function () {
    var self = this;
    var updater = require('./updater.js');

    if (self.timer)
      throw new Error("already running?");

    // Check twice a day.
    self.timer = setInterval(inFiber(function () {
      updater.tryToDownloadUpdate(/* silent */ false);
    }), 12*60*60*1000);

    // Also start a check now, but don't block on it.
    new Fiber(function () {
      updater.tryToDownloadUpdate(/* silent */ false);
    }).run();
  },

  // Returns immediately. However if an update check is currently
  // running it will complete.
  stop: function () {
    var self = this;

    if (self.timer)
      throw new Error("not running?");
    clearInterval(self.timer);
    self.timer = null;
  }
});


///////////////////////////////////////////////////////////////////////////////
// Runner
///////////////////////////////////////////////////////////////////////////////

// options include: port, buildOptions, settingsFile, banner, program,
// disableOplog, rawLogs
//
// banner can be used to replace the application path that is normally
// printed on startup (appDir) with an arbitrary string, for
// example if you autogenerated an app in a temp file to run tests
var Runner = function (appDir, options) {
  var self = this;
  self.appDir = appDir;

  if (! _.has(options, 'port'))
    throw new Error("no port?");

  self.listenPort = options.port;
  self.appPort = self.listenPort + 1;
  self.mongoPort = self.listenPort + 2;

  // XXX XXX set these in cooperation with MongoRunner

  // Allow override and use of external mongo. Matches code in launch_mongo.
  // XXX make this value be an option, set by command.js from the environment
  self.mongoUrl = process.env.MONGO_URL ||
        ("mongodb://127.0.0.1:" + mongoPort + "/meteor");

  // Allow people to specify an MONGO_OPLOG_URL override. If someone specifies a
  // MONGO_URL but not an MONGO_OPLOG_URL, disable the oplog. If neither is
  // specified, use the default internal mongo oplog.
  self.oplogUrl = undefined;
  if (! options.disableOplog) {
    self.oplogUrl = process.env.MONGO_OPLOG_URL ||
      (process.env.MONGO_URL ? undefined
       : "mongodb://127.0.0.1:" + self.mongoPort + "/local");
  }

  // XXX XXX have this be passed in, not slurped from the environment
  self.rootUrl =
    var rootUrl = process.env.ROOT_URL ||
    ('http://localhost:' + self.listenPort + '/');

  self.banner = options.banner || files.prettyPath(self.appDir);

  self.logger = new Logger({
    rawLogs: options.rawLogs
  });

  self.proxy = new Proxy({
    listenPort: self.listenPort,
    proxyToPort: self.appPort,
    logger: self.logger,
    onFailure: _.bind(self._failure, self)
  });

  self.mongoRunner = new MongoRunner({
    appDir: self.appDir,
    port: self.mongoPort,
    logger: self.logger,
    onFailure: _.bind(self._failure, self)
  });

  self.updater = new Updater;

  self.appRunner = new AppRunner({
    appDir: self.appDir,
    appDirForVersionCheck: options.appDirForVersionCheck,
    port: self.appPort,
    buildOptions: options.buildOptions,
    rootUrl: self.rootUrl,
    settingsFile: options.settingsFile,
    program: options.program,
    proxy: self.proxy,
    logger: self.logger
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
    self.mongoRunner.start();
    self.appRunner.start();
  },

  stop: function () {
    var self = this;
    self.proxy.stop();
    self.updater.stop();
    self.mongoRunner.stop();
    self.appRunner.stop();
  },

  // Just run the application (and all of its supporting processes)
  // until the app process exits for the first time. See
  // AppRunner.runOnce for return value.
  //
  // This is silent.
  runOnce: function () {
    var self = this;

    self.proxy.start();
    self.mongoRunner.start();
    var result = self.appRunner.runOnce();
XXX XXX handle failures
    self.proxy.stop();
    self.mongoRunner.stop();

    return result;
  },

  _failure: function () {
    var self = this;
    if (self.onFailure) {
      // Running via start()
XXX edit call sites to honor
      self.onFailure();
    } else {
      // Running via runOnce()
      XXX XXX
    }
  }
});



// XXX replace runner.run with (new Run).start
