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

///////////////////////////////////////////////////////////////////////////////
// Logger
///////////////////////////////////////////////////////////////////////////////

var Logger = function () {
  var self = this;

  // list of log objects from the child process.
  self.serverLog = [];
};

_.extend(Logger.prototype, {
  saveLog: function (msg) {
    var self = this;

    self.serverLog.push(msg);
    if (self.serverLog.length > 100) {
      self.serverLog.shift();
    }
  },

  logToClients: function (type, msg) {
    var self = this;
    self.saveLog(msg);

    if (type === "stdout")
      process.stdout.write(msg + "\n");
    else if (type === "stderr")
      process.stderr.write(msg + "\n");
    else
      console.log(msg);
  },

  clearServerLog: function () {
    var self = this;
    self.serverLog = [];
  },

  getServerLog: function () {
    var self = this;
    return self.serverLog;
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
  //
  // XXX provide a way to stop the proxy server
  start: function () {
    var self = this;

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
        process.stderr.write(
"Can't listen on port " + port + ". Perhaps another Meteor is running?\n" +
"\n" +
"Running two copies of Meteor in the same application directory\n" +
"will not work. If something else is using port " + port + ", you can\n" +
"specify an alternative port with --port <port>.\n");
      } else {
        process.stderr.write(err + "\n");
      }

      process.exit(1);
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

        _.each(self.logger.getServerLog(), function (log) {
          c.res.write(val + "\n");
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
// Status
///////////////////////////////////////////////////////////////////////////////

// options:
// - logger: Logger
// - shouldRestart
var Status = function (options) {
  var self = this;

  _.extend({
    shouldRestart: true
  }, options);

  // XXX ???
  self.logger = options.logger;

  // is server running now?
  self.running = false;

  // does server crash whenever we start it?
  self.crashing = false;

  // do we expect the server to be listening now.
  self.listening = false;

  // how many crashes in rapid succession
  self.counter = 0;

  // exit code last returned
  self.code = 0;

  // true if we should be restarting the server
  self.shouldRestart = options.shouldRestart;

  // true if we're on the way to shutting down the server
  self.shuttingDown = false;

  // XXX ???
  self.mongoHandle = undefined;
};

_.extend(Status.prototype, {
  setMongoHandle: function (mongoHandle) {
    var self = this;
    self.mongoHandle = mongoHandle;
  },

  exitNow: function () {
    var self = this;
    self.logger.logToClients('exit', "Your application is exiting.");
    self.shuttingDown = true;

    if (self.mongoHandle) {
      self.mongoHandle.stop(function (err) {
        if (err)
          process.stdout.write(err.reason + "\n");
        process.exit(self.code);
      });
    }
  },

  reset: function () {
    var self = this;
    self.crashing = false;
    self.counter = 0;
  },

  hardCrashed: function (complaint) {
    complaint = complaint || "is crashing";

    var self = this;
    if (! self.shouldRestart) {
      self.exitNow();
      return;
    }
    self.logger.logToClients('exit', "=> Your application " + complaint +
                             ". Waiting for file change.");
    self.crashing = true;
  },

  softCrashed: function () {
    var self = this;

    if (! self.shouldRestart) {
      self.exitNow();
      return;
    }
    if (self.counter === 0) {
      setTimeout(function () {
        self.counter = 0;
      }, 2000);
    }

    self.counter ++;

    if (self.counter > 2)
      Status.hardCrashed("is crashing");
  }
});

///////////////////////////////////////////////////////////////////////////////
// Server
///////////////////////////////////////////////////////////////////////////////

// Takes options:
// bundlePath
// port
// rootUrl
// mongoUrl
// oplogUrl
// logger
// onExit
// [program]
// [onListen]
// [nodeOptions]
// [settings]
// [rawLogs]

var Server = function (options) {
  var self = this;

  options = _.extend({
    nodeOptions: []
  }, options);

  self.bundlePath = options.bundlePath;
  self.program = options.program || null;
  self.nodeOptions = options.nodeOptions;
  self.onListen = options.onListen;
  self.onExit = options.onExit;
  self.rawLogs = options.rawLogs;
  self.logger = options.logger;

  self.proc = null;
  self.keepaliveTimer = null;

  // Set up environment for server process.
  self.env = _.extend({}, process.env);

  self.env.PORT = options.port;
  self.env.MONGO_URL = options.mongoUrl;
  if (options.oplogUrl)
    self.env.MONGO_OPLOG_URL = options.oplogUrl;
  self.env.ROOT_URL = options.rootUrl;
  if (options.settings)
    self.env.METEOR_SETTINGS = options.settings;
  else
    delete self.env.METEOR_SETTINGS;

  // Display errors from (eg) the NPM connect module over the network.
  self.env.NODE_ENV = 'development';
};

_.extend(Server.prototype, {
  start: function () {
    var self = this;

    self.proc = self._spawn();

    // XXX deal with test server logging differently?!

    var Log = unipackage.load({
      library: release.current.library,
      packages: ['logging']
    }).logging.Log;

    // Since no other process will be listening to stdout and parsing it,
    // print directly in the same format as log messages from other apps
    Log.outputFormat = 'colored-text';

    var processLogLine = function (isStderr, line) {
      if (! line)
        return;

      if (! isStderr && line.match(/^LISTENING\s*$/)) {
        // This is the child process telling us that it's ready to
        // receive connections.
        self.onListen && self.onListen();
        return;
      }

      if (self.rawLogs) {
        console.log(line);
        saveLog(line);
      } else {
        var obj = (isStderr ?
                   Log.objFromText(line, { level: 'warn', stderr: true }) :
                   Log.parse(line) || Log.objFromText(line));
        console.log(Log.format(obj, { color: true }));
        saveLog(Log.format(obj));
      }
    };

    var eachline = require('eachline');
    eachline(self.proc.stdout, 'utf8', _.bind(processLogLine, null, false));
    eachline(self.proc.stderr, 'utf8', _.bind(processLogLine, null, true));

    proc.on('close', function (code, signal) {
      if (signal) {
        self.logger.logToClients('exit', '=> Exited from signal: ' + signal);
      } else {
        self.logger.logToClients('exit', '=> Exited with code: ' + code);
      }

      self.onExit(code);
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
    if (self.proc && self.proc.pid) {
      self.proc.removeAllListeners('close');
      self.proc.kill();
    }

    clearInterval(self.keepaliveTimer);
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

      return child_process.spawn(process.execPath, opts, { env: self.env });
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

      if (! programPath) {
        process.stderr.write("Program '" + self.program + "' not found.\n");
        process.exit(1);
      }

      return child_process.spawn(programPath, [], { env: env });
    }
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

  self.bundlePath = path.join(self.appDir, '.meteor', 'local', 'build');

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
  self.server = null;
  self.watcher = null;
  self.lastThingThatPrintedWasRestartMessage = false;
  self.silentRuns = 0;

  // Hijack process.stdout and process.stderr so that whenever anything is
  // written to one of them, if the last thing we printed as the "Meteor server
  // restarted" message with no newline, we (a) print that newline and (b)
  // remember that *something* was printed (and so we shouldn't try to erase and
  // rewrite the line on the next restart).
  //
  // XXX find a way to do what we want that doesn't involve global
  // hooks
  self.realStdoutWrite = process.stdout.write;
  self.realStderrWrite = process.stderr.write;
  // Call this function before printing anything to stdout or stderr.
  var onStdio = function () {
    if (self.lastThingThatPrintedWasRestartMessage) {
      realStdoutWrite.call(process.stdout, "\n");
      self.lastThingThatPrintedWasRestartMessage = false;
      self.silentRuns = 0;
    }
  };
  process.stdout.write = function () {
    onStdio();
    return self.realStdoutWrite.apply(process.stdout, arguments);
  };
  process.stderr.write = function () {
    onStdio();
    return self.realStderrWrite.apply(process.stderr, arguments);
  };

  self.logger = new Logger;
  self.status = new Status({
    shouldRestart: ! options.once,
    logger: self.logger
  });
  self.proxy = new Proxy({
    listenPort: self.listenPort,
    proxyToPort: self.appPort,
    logger: self.logger
  });

  self.testingPackages = !! options.testPackages;

  self.settingsFile = options.settingsFile;
  self.rawLogs = options.rawLogs;
  self.program = options.program;
  self.banner = options.banner || files.prettyPath(self.appDir);

  // XXX have 'release' be passed in? or determined from appDir, for
  // that matter? anyway, be consistent with bundler and other things
  // that pass it
  var bundleOpts = {
    nodeModulesMode: 'symlink',
    minify: options.minify,
    testPackages: options.testPackages,
    release: release.current
  };

  self.mongoErrorCount = 0;
  self.mongoErrorTimer = undefined;
  self.mongoStartupPrintTimer = undefined;
};

_.extend(Run.prototype, function () {
  // This function never returns and will call process.exit() if it
  // can't continue. If you change this, remember to call
  // watcher.stop() as appropriate.
  //
  // XXX leave a pidfile and check if we are already running
  run: function () {
    var self = this;
    self.proxy.start();

    process.stdout.write("[[[[[ " + self.appDir + " ]]]]]\n\n");

    self.mongoStartupPrintTimer = setTimeout(function () {
      process.stdout.write(
"Initializing mongo database... this may take a moment.\n");
    }, 5000);

    // XXX XXX really should not be doing this globally like this
    updater.startUpdateChecks();
    self._launch();
  },

  _startWatching: function (watchSet) {
    var self = this;

    if (process.env.METEOR_DEBUG_WATCHSET)
      console.log(JSON.stringify(watchSet, null, 2));

    // XXX look at our 'once' option instead?
    if (! self.status.shouldRestart)
      return;

    if (self.watcher)
      self.watcher.stop();

    self.watcher = new watch.Watcher({
      watchSet: watchSet,
      onChange: function () {
        if (self.status.crashing)
          self.logger.logToClients('system', "=> Modified -- restarting.");
        self.status.reset();
        release.current.library.refresh(true); // pick up changes to packages
        self._restartServer();
      }
    });
  },

  // XXX XXX used to return immediately, and run in a fiber..
  // XXX XXX evaluate if that's significant
  _restartServer: function () {
    var self = this;

    self.status.running = false;
    self.status.listening = false;
    self.proxy.setMode("hold");

    if (self.watcher) {
      self.watcher.stop();
      self.watcher = null;
    }

    if (self.server) {
      self.server.stop();
      self.server = null;
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
      console.error("Your app has been updated to Meteor %s from " +
                    "Meteor %s.\nRestart meteor to use the new release.",
                    project.getMeteorReleaseVersion(self.appDir),
                    release.current.name);
      process.exit(1);
    }

    self.logger.clearServerLog();

    // Bundle up the app
    var bundleResult = bundler.bundle(self.appDir, self.bundlePath,
                                      self.bundleOpts);
    var watchSet = bundleResult.watchSet;
    if (bundleResult.errors) {
      self.logger.logToClients('stdout',
                               "=> Errors prevented startup:\n\n" +
                               bundleResult.errors.formatMessages());

      // Ensure that if we are running under --once, we exit with a non-0 code.
      self.status.code = 1;
      self.status.hardCrashed("has errors");
      self.proxy.setMode("errorpage");
      self._startWatching(watchSet);
      return;
    }

    // Read the settings file, if any
    var settings = null;
    if (self.settingsFile)
      settings = runner.getSettings(self.settingsFile, watchSet);

    // Start the server
    self.status.running = true;

    // XXX XXX have this be passed in, not slurped from the environment
    var rootUrl = process.env.ROOT_URL ||
          ('http://localhost:' + self.listenPort + '/');
    if (self.firstRun) {
      process.stdout.write("=> Meteor server running on: " + rootUrl + "\n");
      self.firstRun = false;
      self.lastThingThatPrintedWasRestartMessage = false;
    } else {
      if (self.lastThingThatPrintedWasRestartMessage) {
        // The last run was not the "Running on: " run, and it didn't print
        // anything. So the last thing that printed was the restart message.
        // Overwrite it.
        realStdoutWrite.call(process.stdout, '\r');
      }
      realStdoutWrite.call(process.stdout, "=> Meteor server restarted");
      if (self.lastThingThatPrintedWasRestartMessage) {
        self.silentRuns ++;
        realStdoutWrite.call(process.stdout,
                             " (x" + (self.silentRuns + 1) + ")");
      }
      self.lastThingThatPrintedWasRestartMessage = true;
    }

    self.server = new Server({
      bundlePath: self.bundlePath,
      port: self.appPort,
      rootUrl: rootUrl,
      mongoUrl: self.mongoUrl,
      oplogUrl: self.oplogUrl,
      logger: self.logger,
      onExit: function (code) {
        // on server exit
        self.status.running = false;
        self.status.listening = false;
        self.status.code = code;
        self.status.softCrashed();
        self.proxy.setMode(self.status.crashing ? "errorpage" : "hold");
        if (! self.status.crashing)
          self._restartServer();
      },
      program: self.program,
      onListen: function () {
        // on listen
        self.status.listening = true;
        self.proxy.setMode("proxy");
      },
      nodeOptions: getNodeOptionsFromEnvironment(),
      settings: settings,
      rawLogs: self.rawLogs
    });

    // Start watching for changes for files. There's no hurry to call
    // this, since watchSet contains a snapshot of the state of
    // the world at the time of bundling, in the form of hashes and
    // lists of matching files in each directory.
    self._startWatching(watchSet);
  },

  // XXX XXX used to return immediately, and run in a fiber..
  // XXX XXX evaluate if that's significant
  _launch: function () {
    var self = this;
    self.status.mongoHandle = mongoRunner.launchMongo({
      appDir: self.appDir,
      port: self.mongoPort,

      onListen: function () { // On Mongo startup complete
        // don't print mongo startup is slow warning.
        if (self.mongoStartupPrintTimer) {
          clearTimeout(self.mongoStartupPrintTimer);
          self.mongoStartupPrintTimer = null;
        }

        self._restartServer();
      },

      onExit: function (code, signal, stderr) { // On Mongo dead
        if (self.status.shuttingDown) {
          return;
        }

        // Print only last 20 lines of stderr.
        stderr = stderr.split('\n').slice(-20).join('\n');

        console.log(
          stderr + "Unexpected mongo exit code " + code + ". Restarting.\n");

        // if mongo dies 3 times with less than 5 seconds between
        // each, declare it failed and die.
        self.mongoErrorCount ++;
        if (self.mongoErrorCount >= 3) {
          var explanation = mongoExitCodes.Codes[code];
          console.log("Can't start mongod\n");
          if (explanation)
            console.log(explanation.longText);
          if (explanation === mongoExitCodes.EXIT_NET_ERROR) {
            console.log(
              "\nCheck for other processes listening on port " +
                self.mongoPort +
                "\nor other meteors running in the same project.");
          }
          if (! explanation && /GLIBC/i.test(stderr)) {
            console.log(
              "\nLooks like you are trying to run Meteor on an old Linux " +
                "distribution. Meteor on Linux requires glibc version 2.9 " +
                "or above. Try upgrading your distribution to the latest " +
                "version.");
          }
          process.exit(1);
        }

        if (self.mongoErrorTimer)
          clearTimeout(mongoErrorTimer);

        self.mongoErrorTimer = setTimeout(function () {
          self.mongoErrorCount = 0;
          self.mongoErrorTimer = null;
        }, 5000);

        // Wait a sec to restart.
        setTimeout(_.bind(self.launch, self), 1000);
      }
    });
  }
});
