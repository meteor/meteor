////////// Requires //////////

var fs = require("fs");
var path = require("path");
var spawn = require('child_process').spawn;

var httpProxy = require('http-proxy');

var files = require('./files.js');
var library = require('./library.js');
var project = require('./project.js');
var updater = require('./updater.js');
var bundler = require('./bundler.js');
var mongo_runner = require('./mongo_runner.js');
var mongoExitCodes = require('./mongo_exit_codes.js');
var warehouse = require("./warehouse.js");

var _ = require('underscore');
var inFiber = require('./fiber-helpers.js').inFiber;
var Future = require('fibers/future');

////////// Globals //////////
//XXX: Refactor to not have globals anymore?

// list of log objects from the child process.
var serverLog = [];

var Status = {
  running: false, // is server running now?
  crashing: false, // does server crash whenever we start it?
  listening: false, // do we expect the server to be listening now.
  counter: 0, // how many crashes in rapid succession
  code: 0, // exit code last returned
  shouldRestart: true, // true if we should be restarting the server
  shuttingDown: false, // true if we're on the way to shutting down the server

  exitNow: function () {
    var self = this;
    logToClients({'exit': "Your application is exiting."});
    self.shuttingDown = true;

    self.mongoHandle && self.mongoHandle.stop(function (err) {
      if (err)
        process.stdout.write(err.reason + "\n");
      process.exit(self.code);
    });
  },
  reset: function () {
    this.crashing = false;
    this.counter = 0;
  },

  hardCrashed: function () {
    var self = this;
    if (!self.shouldRestart) {
      self.exitNow();
      return;
    }
    logToClients({'exit': "=> Your application is crashing. Waiting for file change."});
    this.crashing = true;
  },

  softCrashed: function () {
    var self = this;
    if (!self.shouldRestart) {
      self.exitNow();
      return;
    }
    if (this.counter === 0)
      setTimeout(function () {
        this.counter = 0;
      }, 2000);

    this.counter++;

    if (this.counter > 2) {
      Status.hardCrashed();
    }
  }
};

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

// List of queued requests. Each item in the list is a function to run
// when the inner app is ready to receive connections.
var requestQueue = [];

////////// Outer Proxy Server //////////
//
// calls callback once proxy is actively listening on outer and
// proxying to inner.

var startProxy = function (outerPort, innerPort, callback) {
  callback = callback || function () {};

  var p = httpProxy.createServer(function (req, res, proxy) {
    if (Status.crashing) {
      // sad face. send error logs.
      // XXX formatting! text/plain is bad
      res.writeHead(200, {'Content-Type': 'text/plain'});

      res.write("Your app is crashing. Here's the latest log.\n\n");

      _.each(serverLog, function(log) {
        _.each(log, function(val, key) {
          if (val)
            res.write(val);
          // deal with mixed line endings! XXX
          if (key !== 'stdout' && key !== 'stderr')
            res.write("\n");
        });
      });

      res.end();
    } else if (Status.listening) {
      // server is listening. things are hunky dory!
      proxy.proxyRequest(req, res, {
        host: '127.0.0.1', port: innerPort
      });
    } else {
      // Not listening yet. Queue up request.
      var buffer = httpProxy.buffer(req);
      requestQueue.push(function () {
        proxy.proxyRequest(req, res, {
          host: '127.0.0.1', port: innerPort,
          buffer: buffer
        });
      });
    }
  });

  // Proxy websocket requests using same buffering logic as for regular HTTP requests
  p.on('upgrade', function(req, socket, head) {
    if (Status.listening) {
      // server is listening. things are hunky dory!
      p.proxy.proxyWebSocketRequest(req, socket, head, {
        host: '127.0.0.1', port: innerPort
      });
    } else {
      // Not listening yet. Queue up request.
      var buffer = httpProxy.buffer(req);
      requestQueue.push(function () {
        p.proxy.proxyWebSocketRequest(req, socket, head, {
          host: '127.0.0.1', port: innerPort,
          buffer: buffer
        });
      });
    }
  });

  p.on('error', function (err) {
    if (err.code == 'EADDRINUSE') {
      process.stderr.write("Can't listen on port " + outerPort
                           + ". Perhaps another Meteor is running?\n");
      process.stderr.write("\n");
      process.stderr.write("Running two copies of Meteor in the same application directory\n");
      process.stderr.write("will not work. If something else is using port " + outerPort + ", you can\n");
      process.stderr.write("specify an alternative port with --port <port>.\n");
    } else {
      process.stderr.write(err + "\n");
    }

    process.exit(1);
  });

  // don't spin forever if the app doesn't respond. instead return an
  // error immediately. This shouldn't happen much since we try to not
  // send requests if the app is down.
  p.proxy.on('proxyError', function (err, req, res) {
    res.writeHead(503, {
      'Content-Type': 'text/plain'
    });
    res.end('Unexpected error.');
  });

  p.listen(outerPort, callback);
};

////////// MongoDB //////////

var logToClients = function (msg) {
  serverLog.push(msg);
  if (serverLog.length > 100) {
    serverLog.shift();
  }

  // log to console
  //
  // XXX this is a mess. some lines have newlines, and some don't.
  // this whole thing should be redone. it is the result of doing it
  // very differently and changing over quickly.
  _.each(msg, function (val, key) {
    if (key === "stdout")
      process.stdout.write(val);
    else if (key === "stderr")
      process.stderr.write(val);
    else
      console.log(val);
  });
};

////////// Launch server process //////////
// Takes options:
// bundlePath
// outerPort
// innerPort
// mongoUrl
// onExit
// [onListen]
// [nodeOptions]
// [settingsFile]

var startServer = function (options) {
  // environment
  options = _.extend({
    nodeOptions: []
  }, options);

  var env = {};
  for (var k in process.env)
    env[k] = process.env[k];

  env.PORT = options.innerPort;
  env.MONGO_URL = options.mongoUrl;
  env.ROOT_URL = env.ROOT_URL || ('http://localhost:' + options.outerPort);
  if (options.settingsFile) {
    // Re-read the settings file each time we call startServer.
    var settings = exports.getSettings(options.settingsFile);
    if (settings)
      env.METEOR_SETTINGS = settings;
  }

  var nodeOptions = _.clone(options.nodeOptions);
  nodeOptions.push(path.join(options.bundlePath, 'main.js'));
  nodeOptions.push('--keepalive');

  var proc = spawn(process.execPath,
                   nodeOptions,
                   {env: env});

  // XXX deal with test server logging differently?!

  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', function (data) {
    if (!data) return;

    var originalLength = data.length;
    // string must match server.js
    data = data.replace(/^LISTENING\s*(?:\n|$)/m, '');
    if (data.length != originalLength)
      options.onListen && options.onListen();
    if (data) {
      logToClients({stdout: data});
    }
  });

  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', function (data) {
    if (data) {
      logToClients({stderr: data});
    }
  });

  proc.on('exit', function (code, signal) {
    if (signal) {
      logToClients({'exit': '=> Exited from signal: ' + signal});
    } else {
      logToClients({'exit': '=> Exited with code: ' + code});
    }

    options.onExit(code);
  });

  // this happens sometimes when we write a keepalive after the app is
  // dead. If we don't register a handler, we get a top level exception
  // and the whole app dies.
  // http://stackoverflow.com/questions/2893458/uncatchable-errors-in-node-js
  proc.stdin.on('error', function () {});

  // Keepalive so server can detect when we die
  var timer = setInterval(function () {
    try {
      if (proc && proc.pid && proc.stdin && proc.stdin.write)
        proc.stdin.write('k');
    } catch (e) {
      // do nothing. this fails when the process dies.
    }
  }, 2000);

  return {
    proc: proc,
    timer: timer
  };
};

var killServer = function (handle) {
  if (handle.proc.pid) {
    handle.proc.removeAllListeners('exit');
    handle.proc.kill();
  }
  clearInterval(handle.timer);
};

////////// Watching dependencies  //////////

// deps is the data from dependencies.json in the bundle
// appDir is the root of the app
// relativeFiles are any other files to watch, relative to the current
//   directory (eg, the --settings file)
// onChange is only fired once
var DependencyWatcher = function (
    deps, appDir, relativeFiles, library, onChange) {
  var self = this;

  self.appDir = appDir;
  self.onChange = onChange;
  self.watches = {}; // path => unwatch function with no arguments
  self.lastContents = {}; // path => last contents (array of filenames)
  self.mtimes = {}; // path => last seen mtime

  // If a file is under a sourceDir, and has one of the
  // sourceExtensions, then it's interesting.
  self.sourceDirs = [self.appDir];
  self.sourceExtensions = deps.extensions || [];

  // Any file under a bulkDir is interesting. (bulkDirs may also
  // contain individual files)
  self.bulkDirs = [];
  // If we're running from a git checkout, we reload when "core" files like
  // server.js change.
  if (!files.usesWarehouse()) {
    _.each(deps.core || [], function (filepath) {
      self.bulkDirs.push(path.join(files.getCurrentToolsDir(), filepath));
    });
  }
  _.each(deps.app || [], function (filepath) {
    self.bulkDirs.push(path.join(self.appDir, filepath));
  });

  // Additional list of specific files that are interesting.
  self.specificFiles = {};
  for (var pkg in (deps.packages || {})) {
    // We only watch for changes in local packages, rather than ones in the
    // warehouse, since only changes to local ones need to cause an app to
    // reload. Notably, the app will *not* reload the first time a local package
    // is created which overrides an installed package.
    var localPackageDir = library.directoryForLocalPackage(pkg);
    if (localPackageDir) {
      _.each(deps.packages[pkg], function (file) {
        self.specificFiles[path.join(localPackageDir, file)] = true;
      });
    }
  };

  _.each(relativeFiles, function (file) {
    self.specificFiles[file] = true;
  });

  // Things that are never interesting.
  self.excludePatterns = _.map((deps.exclude || []), function (pattern) {
    return new RegExp(pattern);
  });
  self.excludePaths = [
    path.join(appDir, '.meteor', 'local'),
    // For app packages, we only watch files explicitly used by the package (in
    // specificFiles)
    path.join(appDir, 'packages')
  ];

  // Start monitoring
  _.each(_.union(self.sourceDirs, self.bulkDirs, _.keys(self.specificFiles)),
         _.bind(self._scan, self, true));

  // mtime scans are great and relatively efficient, but they have a couple of
  // issues. One is that they only detect changes in mtimes from the start of
  // dependency watching, not from the actual bundled file, so if bundling is
  // slow and somebody edits a file after it's used by the bundler but before
  // the DependencyWatcher is created, we'll miss it. An even worse problem is
  // that on OSX HFS+, mtime resolution is only one second, so if a file is
  // written twice in a second the bundler might get the first version and never
  // notice the second change! So, in a second, we'll do a one-time scan to
  // check the hash of each file against what the bundler told us we should see.
  //
  // This will still miss files that are newly added during bundling, and there
  // are also race conditions where the bundler may calculate some hashes via a
  // separate read than the read that actually was used in bundling... but it's
  // close.
  setTimeout(function() {
    _.each(deps.hashes, function (hash, filepath) {
      fs.readFile(filepath, function (error, contents) {
        // Fire if the file was deleted or changed contents.
        if (error || bundler.sha1(contents) !== hash)
          self._fire();
      });
    });
  }, 1000);
};

_.extend(DependencyWatcher.prototype, {
  // stop monitoring
  destroy: function () {
    var self = this;
    self.onChange = null;
    for (var filepath in self.watches)
      self.watches[filepath](); // unwatch
    self.watches = {};
  },

  _fire: function () {
    var self = this;
    if (self.onChange) {
      var f = self.onChange;
      self.onChange = null;
      f();
      self.destroy();
    }
  },

  // initial is true on the inital scan, to suppress notifications
  _scan: function (initial, filepath) {
    var self = this;

    if (self._isExcluded(filepath))
      return false;

    try {
      var stats = fs.lstatSync(filepath);
    } catch (e) {
      // doesn't exist -- leave stats undefined
    }

    // '+' is necessary to coerce the mtimes from date objects to ints
    // (unix times) so they can be conveniently tested for equality
    if (stats && +stats.mtime === +self.mtimes[filepath])
      // We already know about this file and it hasn't actually
      // changed. Probably its atime changed.
      return;

    // If an interesting file has changed, fire!
    var isInteresting = self._isInteresting(filepath);
    if (!initial && isInteresting) {
      self._fire();
      return;
    }

    if (!stats) {
      // A directory (or an uninteresting file) was removed
      var unwatch = self.watches[filepath];
      unwatch && unwatch();
      delete self.watches[filepath];
      delete self.lastContents[filepath];
      delete self.mtimes[filepath];
      return;
    }

    // If we're seeing this file or directory for the first time,
    // monitor it if necessary
    if (!(filepath in self.watches) &&
        (isInteresting || stats.isDirectory())) {
      if (!stats.isDirectory()) {
        // Intentionally not using fs.watch since it doesn't play well with
        // vim (https://github.com/joyent/node/issues/3172)
        fs.watchFile(filepath, {interval: 500}, // poll a lot!
                     _.bind(self._scan, self, false, filepath));
        self.watches[filepath] = function() { fs.unwatchFile(filepath); };
      } else {
        // fs.watchFile doesn't work for directories (as tested on ubuntu)
        var watch = fs.watch(filepath, {interval: 500}, // poll a lot!
                     _.bind(self._scan, self, false, filepath));
        self.watches[filepath] = function() { watch.close(); };
      }
      self.mtimes[filepath] = stats.mtime;
    }

    // If a directory, recurse into any new files it contains. (We
    // don't need to check for removed files here, since if we care
    // about a file, we'll already be monitoring it)
    if (stats.isDirectory()) {
      var oldContents = self.lastContents[filepath] || [];
      var newContents = fs.readdirSync(filepath);
      var added = _.difference(newContents, oldContents);

      self.lastContents[filepath] = newContents;
      _.each(added, function (child) {
        self._scan(initial, path.join(filepath, child));
      });
    }
  },

  // Should we even bother to scan/recurse into this file?
  _isExcluded: function (filepath) {
    var self = this;

    // Files we're specifically being asked to scan are never excluded. For
    // example, files from app packages (that are actually pulled in by their
    // package.js) are not excluded, but the app packages directory itself is
    // (so that other files in package directories aren't watched).
    if (filepath in self.specificFiles)
      return false;

    if (_.indexOf(self.excludePaths, filepath) !== -1)
      return true;

    var excludedByPattern = _.any(self.excludePatterns, function (regexp) {
      return path.basename(filepath).match(regexp);
    });

    return excludedByPattern;
  },

  // Should we fire if this file changes?
  _isInteresting: function (filepath) {
    var self = this;

    if (self._isExcluded(filepath))
      return false;

    var inAnyDir = function (dirs) {
      return _.any(dirs, function (dir) {
        return filepath.slice(0, dir.length) === dir;
      });
    };

    // Specific, individual files that we want to monitor
    if (filepath in self.specificFiles)
      return true;

    // Source files
    if (inAnyDir(self.sourceDirs) &&
        files.findExtension(self.sourceExtensions, filepath))
      return true;

    // Other directories and files that are included
    if (inAnyDir(self.bulkDirs))
      return true;

    return false;
  }
});

///////////////////////////////////////////////////////////////////////////////

// Also used by "meteor deploy" in meteor.js.

exports.getSettings = function (filename) {
  var str;
  try {
    str = fs.readFileSync(filename, "utf8");
  } catch (e) {
    throw new Error("Could not find settings file " + filename);
  }
  if (str.length > 0x10000) {
    throw new Error("Settings file must be less than 64 KB long");
  }
  // Ensure that the string is parseable in JSON, but there's
  // no reason to use the object value of it yet.
  if (str.match(/\S/)) {
    JSON.parse(str);
    return str;
  } else {
    return "";
  }
};

// XXX leave a pidfile and check if we are already running

// This function never returns and will call process.exit() if it
// can't continue. If you change this, remember to call
// watcher.destroy() as appropriate.
//
// context is as created in meteor.js.
// options include: port, minify, once, settingsFile, testPackages
exports.run = function (context, options) {
  var outerPort = options.port || 3000;
  var innerPort = outerPort + 1;
  var mongoPort = outerPort + 2;
  var bundlePath = path.join(context.appDir, '.meteor', 'local', 'build');
  // Allow override and use of external mongo. Matches code in launch_mongo.
  var mongoUrl = process.env.MONGO_URL ||
        ("mongodb://127.0.0.1:" + mongoPort + "/meteor");
  var firstRun = true;

  var serverHandle;
  var watcher;

  var lastThingThatPrintedWasRestartMessage = false;
  var silentRuns = 0;

  // Hijack process.stdout and process.stderr so that whenever anything is
  // written to one of them, if the last thing we printed as the "Meteor server
  // restarted" message with no newline, we (a) print that newline and (b)
  // remember that *something* was printed (and so we shouldn't try to erase and
  // rewrite the line on the next restart).
  var realStdoutWrite = process.stdout.write;
  var realStderrWrite = process.stderr.write;
  // Call this function before printing anything to stdout or stderr.
  var onStdio = function () {
    if (lastThingThatPrintedWasRestartMessage) {
      realStdoutWrite.call(process.stdout, "\n");
      lastThingThatPrintedWasRestartMessage = false;
      silentRuns = 0;
    }
  };
  process.stdout.write = function () {
    onStdio();
    return realStdoutWrite.apply(process.stdout, arguments);
  };
  process.stderr.write = function () {
    onStdio();
    return realStderrWrite.apply(process.stderr, arguments);
  };


  if (options.once) {
    Status.shouldRestart = false;
  }

  var bundleOpts = {
    nodeModulesMode: 'symlink',
    minify: options.minify,
    testPackages: options.testPackages,
    releaseStamp: context.releaseVersion,
    library: context.library
  };

  var startWatching = function (dependencyInfo) {
    if (!Status.shouldRestart)
      return;

    if (watcher)
      watcher.destroy();

    var relativeFiles;
    if (options.settingsFile) {
      relativeFiles = [options.settingsFile];
    }

    var onChange = function () {
      if (Status.crashing)
        logToClients({'system': "=> Modified -- restarting."});
      Status.reset();
      restartServer();
    };

    watcher = new DependencyWatcher(dependencyInfo, context.appDir,
                                    relativeFiles, context.library, onChange);
  };

  // Using `inFiber` since bundling can yield when loading a manifest
  // file from warehouse.meteor.com.
  var restartServer = inFiber(function () {
    Status.running = false;
    Status.listening = false;
    if (serverHandle)
      killServer(serverHandle);

    // If the user did not specify a --release on the command line, and
    // simultaneously runs `meteor update` during this run, just exit and let
    // them restart the run. (We can do something fancy like allowing this to
    // work if the tools version didn't change, or even springboarding if the
    // tools version does change, but this (which prevents weird errors) is a
    // start.)
    // (Make sure that we don't hit this test for "meteor test-packages",
    // though; there's not a real app to update there!)
    if (files.usesWarehouse() && !context.userReleaseOverride &&
        !options.testPackages) {
      var newAppRelease = project.getMeteorReleaseVersion(context.appDir) ||
            warehouse.latestRelease();
      if (newAppRelease !== context.appReleaseVersion) {
        console.error("Your app has been updated to Meteor %s from " +
                      "Meteor %s.\nRestart meteor to use the new release.",
                      newAppRelease,
                      context.appReleaseVersion);
        process.exit(1);
      }
    }

    serverLog = [];

    // Make the library reload packages, in case they've changed
    context.library.flush();

    var bundleResult = bundler.bundle(context.appDir, bundlePath, bundleOpts);
    startWatching(bundleResult.dependencyInfo);

    if (bundleResult.errors) {
      logToClients({stdout: "=> Errors prevented startup:\n"});
      _.each(bundleResult.errors, function (e) {
        logToClients({stdout: e + "\n"});
      });

      Status.hardCrashed();
      return;
    }

    Status.running = true;

    if (firstRun) {
      process.stdout.write("=> Meteor server running on: http://localhost:" + outerPort + "/\n");
      firstRun = false;
      lastThingThatPrintedWasRestartMessage = false;
    } else {
      if (lastThingThatPrintedWasRestartMessage) {
        // The last run was not the "Running on: " run, and it didn't print
        // anything. So the last thing that printed was the restart message.
        // Overwrite it.
        realStdoutWrite.call(process.stdout, '\r');
      }
      realStdoutWrite.call(process.stdout, "=> Meteor server restarted");
      if (lastThingThatPrintedWasRestartMessage) {
        ++silentRuns;
        realStdoutWrite.call(process.stdout, " (x" + (silentRuns+1) + ")");
      }
      lastThingThatPrintedWasRestartMessage = true;
    }

    serverHandle = startServer({
      bundlePath: bundlePath,
      outerPort: outerPort,
      innerPort: innerPort,
      mongoUrl: mongoUrl,
      onExit: function (code) {
        // on server exit
        Status.running = false;
        Status.listening = false;
        Status.code = code;
        Status.softCrashed();
        if (!Status.crashing)
          restartServer();
      },
      onListen: function () {
        // on listen
        Status.listening = true;
        _.each(requestQueue, function (f) { f(); });
        requestQueue = [];
      },
      nodeOptions: getNodeOptionsFromEnvironment(),
      settingsFile: options.settingsFile
    });
  });

  var mongoErrorCount = 0;
  var mongoErrorTimer;
  var mongoStartupPrintTimer;
  var launch = function () {
    Status.mongoHandle = mongo_runner.launch_mongo(
      context.appDir,
      mongoPort,
      function () { // On Mongo startup complete
        // don't print mongo startup is slow warning.
        if (mongoStartupPrintTimer) {
          clearTimeout(mongoStartupPrintTimer);
          mongoStartupPrintTimer = null;
        }
        restartServer();
      },
      function (code, signal) { // On Mongo dead
        if (Status.shuttingDown) {
          return;
        }
        console.log("Unexpected mongo exit code " + code + ". Restarting.");

        // if mongo dies 3 times with less than 5 seconds between each,
        // declare it failed and die.
        mongoErrorCount += 1;
        if (mongoErrorCount >= 3) {
          var explanation = mongoExitCodes.Codes[code];
          console.log("Can't start mongod\n");
          if (explanation)
            console.log(explanation.longText);
          if (explanation === mongoExitCodes.EXIT_NET_ERROR)
            console.log("\nCheck for other processes listening on port " + mongoPort +
                        "\nor other meteors running in the same project.");
          process.exit(1);
        }
        if (mongoErrorTimer)
          clearTimeout(mongoErrorTimer);
        mongoErrorTimer = setTimeout(function () {
          mongoErrorCount = 0;
          mongoErrorTimer = null;
        }, 5000);

        // Wait a sec to restart.
        setTimeout(launch, 1000);
      });
  };

  startProxy(outerPort, innerPort, function () {
    process.stdout.write("[[[[[ " + files.pretty_path(context.appDir) + " ]]]]]\n\n");

    mongoStartupPrintTimer = setTimeout(function () {
      process.stdout.write("Initializing mongo database... this may take a moment.\n");
    }, 3000);

    updater.startUpdateChecks(context);
    launch();
  });
};
