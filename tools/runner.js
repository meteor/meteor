var fs = require("fs");
var path = require("path");
var _ = require('underscore');
var Future = require('fibers/future');
var Fiber = require('fibers');
var files = require('./files.js');
var watch = require('./watch.js');
var project = require('./project.js');
var updater = require('./updater.js');
var bundler = require('./bundler.js');
var mongoRunner = require('./mongo-runner.js');
var mongoExitCodes = require('./mongo-exit-codes.js');
var unipackage = require('./unipackage.js');
var release = require('./release.js');
var inFiber = require('./fiber-helpers.js').inFiber;

// XXX XXX just suck it up and replace setTimeout and clearTimeout,
// globally, with fiberized versions? will this mess up npm modules?


// XXX XXX NEXT (if you want to do more):

// - fold app bundle/restart logic into AppServer, so that ultimately
//   the top-level runner object can just be a thing that manages a
//   flock of processes without knowing too much about them.
// - possibly fold the mongo restart logic into the mongo-runner.js
// - make updater into an object with start and stop methods
// - break each thing out into a separate file.. run-proxy, run-app,
//   run-updater, run-mongo..
//   - be careful about overabstracting things, though, to the point
//     that it becomes hard to create the holistic UX you want, or to
//     the point that you spend a bunch of time on how many loggers
//     can dance on the head of a pin
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

// options: listenPort, proxyToPort, logger
var Proxy = function (options) {
  var self = this;

  self.listenPort = options.listenPort;
  self.proxyToPort = options.proxyToPort;
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
        die(
"Can't listen on port " + port + ". Perhaps another Meteor is running?\n" +
"\n" +
"Running two copies of Meteor in the same application directory\n" +
"will not work. If something else is using port " + port + ", you can\n" +
"specify an alternative port with --port <port>.\n");
      } else {
        die(err + "\n");
      }
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
// AppServer
///////////////////////////////////////////////////////////////////////////////

// Required options: bundlePath, port, rootUrl, mongoUrl, oplogUrl, logger
// Optional options: onExit, onListen, program, nodeOptions, settings

var AppServer = function (options) {
  var self = this;

  self.bundlePath = options.bundlePath;
  self.port = options.port;
  self.rootUrl = options.rootUrl;
  self.oplogUrl = option.oplogUrl;
  self.logger = options.logger;
  self.onExit = options.onExit;

  self.program = options.program || null;
  self.onListen = options.onListen;
  self.nodeOptions = options.nodeOptions || [];
  self.settings = options.settings;

  self.proc = null;
  self.keepaliveTimer = null;
};

_.extend(AppServer.prototype, {
  start: function () {
    var self = this;

    if (self.proc)
      throw new Error("already started?");

    // Start the app!
    self.proc = self._spawn();

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

      self.onExit && self.onExit(code);
    });

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

  stop: function () {
    var self = this;

    if (! self.proc)
      throw new Error("not running?");

    if (self.proc.pid) {
      self.proc.removeAllListeners('close');
      self.proc.kill();
    }
    self.proc = null;

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
  // child_process.spawn.
  _spawn: function () {
    var self = this;

    var child_process = require('child_process');

    if (! self.program) {
      // Old-style bundle
      var opts = _.clone(self.nodeOptions);
      opts.push(path.join(self.bundlePath, 'main.js'));
      opts.push('--keepalive');

      return child_process.spawn(process.execPath, opts, {
        env: self._computeEnvironment();
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
        die("Program '" + self.program + "' not found.\n");

      return child_process.spawn(programPath, [], {
        env: self._computeEnvironment()
      });
    }
  }
});

///////////////////////////////////////////////////////////////////////////////
// Mongo
///////////////////////////////////////////////////////////////////////////////

// This runs a Mongo process and restarts it whenever it fails. If it
// restarts too often, though, it just kills the whole program!

// options: appDir, port, logger
var MongoServer = function (options) {
  var self = this;

  self.appDir = options.appDir;
  self.port = options.port;
  self.logger = options.logger;

  self.handle = null;
  self.shuttingDown = false;
  self.startupFuture = null;

  self.errorCount = 0;
  self.errorTimer = null;
  self.lastRestartTime = null
  self.startupPrintTimer = undefined;
};

_.extend(MongoServer.prototype, {
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

    self.lastRestartTime = new Date;
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
    setTimeout(function () {
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
    var message = "Can't start mongod\n\n";

    if (explanation)
      message += explanation.longText + "\n";

    if (explanation === mongoExitCodes.EXIT_NET_ERROR) {
      message += "\n" +
"Check for other processes listening on port " + self.mongoPort + "\n" +
"or other Meteor instances running in the same project.\n";
    }

    if (! explanation && /GLIBC/i.test(stderr)) {
      message += "\n" +
"Looks like you are trying to run Meteor on an old Linux distribution.\n" +
"Meteor on Linux requires glibc version 2.9 or above. Try upgrading your\n" +
"distribution to the latest version.\n";
    }

    die(message);
  },

  stop: function () {
    var self = this;

    if (! self.handle)
      // If not running, silently do nothing.. maybe the other objects
      // should work the same way?
      return;

    var fut = new Future;
    // XXX fiberize upstream
    self.shuttingDown = true;
    self.handle.stop(function (err) {
      if (err)
        process.stdout.write(err.reason + "\n");
      fut['return']();
    });

    fut.wait();
  }
});

///////////////////////////////////////////////////////////////////////////////
// Run
///////////////////////////////////////////////////////////////////////////////

// options include: port, minify, once, settingsFile, testPackages,
// banner, program, disableOplog, rawLogs
//
// banner can be used to replace the application path that is normally
// printed on startup (appDir) with an arbitrary string, for
// example if you autogenerated an app in a temp file to run tests
var Run = function (appDir, options) {
  var self = this;
  self.appDir = appDir;

  if (! _.has(options, 'port'))
    throw new Error("no port?");

  self.listenPort = options.port;
  self.appPort = self.listenPort + 1;
  self.mongoPort = self.listenPort + 2;

  // XXX XXX set these in cooperation with MongoServer

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

  self.firstRun = true;
  self.appServer = null;
  self.watcher = null;

  // is server running now?
  self.running = false;
  // does server crash whenever we start it?
  self.crashing = false;
  // do we expect the server to be listening now.
  self.listening = false;
  // how many crashes in rapid succession
  self.counter = 0;

  self.logger = new Logger({
    rawLogs: options.rawLogs
  });
  self.proxy = new Proxy({
    listenPort: self.listenPort,
    proxyToPort: self.appPort,
    logger: self.logger
  });
  self.mongoServer = new MongoServer({
    appDir: self.appDir,
    port: self.mongoPort,
    logger: self.logger
  });

  self.testingPackages = !! options.testPackages;

  self.settingsFile = options.settingsFile;
  self.program = options.program;
  self.banner = options.banner || files.prettyPath(self.appDir);
  self.once = options.once;

  // XXX have the caller pass this in?

  // XXX have 'release' be passed in? or determined from appDir, for
  // that matter? anyway, be consistent with bundler and other things
  // that pass it
  var bundleOpts = {
    nodeModulesMode: 'symlink',
    minify: options.minify,
    testPackages: options.testPackages,
    release: release.current
  };
};

_.extend(Run.prototype, function () {
  // This function never returns and will call process.exit() if it
  // can't continue. If you change this, remember to call
  // watcher.stop() as appropriate.
  //
  // XXX leave a pidfile and check if we are already running
  //
  // XXX or, more like, it returns almost immediately?
  run: function () {
    var self = this;
    self.proxy.start();

    process.stdout.write("[[[[[ " + self.appDir + " ]]]]]\n\n");

    // XXX XXX really should not be doing this globally like this
    updater.startUpdateChecks();
    self.mongoServer.start();
    self._bundleAndRestart();
  },

  _startWatching: function (watchSet) {
    var self = this;

    if (process.env.METEOR_DEBUG_WATCHSET)
      self.logger.log(JSON.stringify(watchSet, null, 2));

    if (self.once)
      return;

    if (self.watcher)
      self.watcher.stop();

    self.watcher = new watch.Watcher({
      watchSet: watchSet,
      onChange: function () {
        if (self.crashing)
          self.logger.log("=> Modified -- restarting.");
        self.crashing = false;
        self.counter = 0;
        release.current.library.refresh(true); // pick up changes to packages
        self._bundleAndRestart();
      }
    });
  },

  // XXX XXX used to return immediately, and run in a fiber..
  // XXX XXX evaluate if that's significant
  _bundleAndRestart: function () {
    var self = this;

    self.running = false;
    self.listening = false;
    self.proxy.setMode("hold");

    if (self.watcher) {
      self.watcher.stop();
      self.watcher = null;
    }

    if (self.appServer) {
      self.appServer.stop();
      self.appServer = null;
    }

    // If the user did not specify a --release on the command line,
    // and simultaneously runs `meteor update` during this run, just
    // exit and let them restart the run. (We can do something fancy
    // like allowing this to work if the tools version didn't change,
    // or even springboarding if the tools version does change, but
    // this (which prevents weird errors) is a start.) (Make sure
    // that we don't hit this test for "meteor test-packages", though;
    // there's not a real app to update there!)
    if (! self.testingPackages &&
        ! release.usingRightReleaseForApp(self.appDir)) {
      var to = project.getMeteorReleaseVersion(self.appDir);
      var from = release.current.name;
      die(
"Your app has been updated to Meteor " + to + " from " + "Meteor " + from +
".\n" +
"Restart meteor to use the new release.\n");
    }

    self.logger.clearLog();

    // Bundle up the app

    var bundlePath = path.join(self.appDir, '.meteor', 'local', 'build');
    var bundleResult = bundler.bundle(self.appDir, bundlePath,
                                      self.bundleOpts);
    var watchSet = bundleResult.watchSet;
    if (bundleResult.errors) {
      self.logger.log("=> Errors prevented startup:\n\n" +
                      bundleResult.errors.formatMessages());

      if (self.once)
        self._exit(1);

      self.logger.log("=> Your application has errors. " +
                      "Waiting for file change.");
      self.crashing = true;
      self.proxy.setMode("errorpage");
      self._startWatching(watchSet);
      return;
    }

    // Read the settings file, if any
    var settings = null;
    if (self.settingsFile)
      settings = runner.getSettings(self.settingsFile, watchSet);

    // Start the server
    self.running = true;

    // XXX XXX have this be passed in, not slurped from the environment
    var rootUrl = process.env.ROOT_URL ||
          ('http://localhost:' + self.listenPort + '/');
    if (self.firstRun) {
      self.logger.log("=> Meteor server running on: " + rootUrl + "\n");
      self.firstRun = false;
    } else {
      self.logger.logRestart();
    }

    self.appServer = new AppServer({
      bundlePath: bundlePath,
      port: self.appPort,
      rootUrl: rootUrl,
      mongoUrl: self.mongoUrl,
      oplogUrl: self.oplogUrl,
      logger: self.logger,
      onExit: function (code) {
        // on server exit
        self.running = false;
        self.listening = false;
        if (self.once)
          self._exit(code);

        if (self.counter === 0) {
          setTimeout(function () {
            self.counter = 0;
          }, 2000);
          // XXX cancel timeout at appropriate time..
        }
        self.counter ++;
        if (self.counter > 2) {
          self.logger.log("=> Your application is crashing. " +
                          "Waiting for file change.");
          self.crashing = true;
        }

        self.proxy.setMode(self.crashing ? "errorpage" : "hold");
        if (! self.crashing)
          self._bundleAndRestart();
      },
      program: self.program,
      onListen: function () {
        // on listen
        self.listening = true;
        self.proxy.setMode("proxy");
      },
      nodeOptions: getNodeOptionsFromEnvironment(),
      settings: settings
    });
    self.appServer.start();

    // Start watching for changes for files. There's no hurry to call
    // this, since watchSet contains a snapshot of the state of
    // the world at the time of bundling, in the form of hashes and
    // lists of matching files in each directory.
    self._startWatching(watchSet);
  },

  // XXX make this go away
  _exit: function (code) {
    var self = this;

    self.logger.log("Your application is exiting.");

    self.mongoServer.stop();
    process.exit(code);
  }
});
