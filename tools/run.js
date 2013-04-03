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
var server_log = [];

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
    log_to_clients({'exit': "Your application is exiting."});
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

  hard_crashed: function () {
    var self = this;
    if (!self.shouldRestart) {
      self.exitNow();
      return;
    }
    log_to_clients({'exit': "=> Your application is crashing. Waiting for file change."});
    this.crashing = true;
  },

  soft_crashed: function () {
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
      Status.hard_crashed();
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
var request_queue = [];

////////// Outer Proxy Server //////////
//
// calls callback once proxy is actively listening on outer and
// proxying to inner.

var start_proxy = function (outer_port, inner_port, callback) {
  callback = callback || function () {};

  var p = httpProxy.createServer(function (req, res, proxy) {
    if (Status.crashing) {
      // sad face. send error logs.
      // XXX formatting! text/plain is bad
      res.writeHead(200, {'Content-Type': 'text/plain'});

      res.write("Your app is crashing. Here's the latest log.\n\n");

      _.each(server_log, function(log) {
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
        host: '127.0.0.1', port: inner_port
      });
    } else {
      // Not listening yet. Queue up request.
      var buffer = httpProxy.buffer(req);
      request_queue.push(function () {
        proxy.proxyRequest(req, res, {
          host: '127.0.0.1', port: inner_port,
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
        host: '127.0.0.1', port: inner_port
      });
    } else {
      // Not listening yet. Queue up request.
      var buffer = httpProxy.buffer(req);
      request_queue.push(function () {
        p.proxy.proxyWebSocketRequest(req, socket, head, {
          host: '127.0.0.1', port: inner_port,
          buffer: buffer
        });
      });
    }
  });

  p.on('error', function (err) {
    if (err.code == 'EADDRINUSE') {
      process.stderr.write("Can't listen on port " + outer_port
                           + ". Perhaps another Meteor is running?\n");
      process.stderr.write("\n");
      process.stderr.write("Running two copies of Meteor in the same application directory\n");
      process.stderr.write("will not work. If something else is using port " + outer_port + ", you can\n");
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

  p.listen(outer_port, callback);
};

////////// MongoDB //////////

var log_to_clients = function (msg) {
  server_log.push(msg);
  if (server_log.length > 100) {
    server_log.shift();
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
// mongoURL
// onExit
// [onListen]
// [nodeOptions]
// [settingsFile]

var start_server = function (options) {
  // environment
  options = _.extend({
    nodeOptions: []
  }, options);

  var env = {};
  for (var k in process.env)
    env[k] = process.env[k];

  env.PORT = options.innerPort;
  env.MONGO_URL = options.mongoURL;
  env.ROOT_URL = env.ROOT_URL || ('http://localhost:' + options.outerPort);
  if (options.settingsFile) {
    // Re-read the settings file each time we call start_server.
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
      log_to_clients({stdout: data});
    }
  });

  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', function (data) {
    if (data) {
      log_to_clients({stderr: data});
    }
  });

  proc.on('exit', function (code, signal) {
    if (signal) {
      log_to_clients({'exit': '=> Exited from signal: ' + signal});
    } else {
      log_to_clients({'exit': '=> Exited with code: ' + code});
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

var kill_server = function (handle) {
  if (handle.proc.pid) {
    handle.proc.removeAllListeners('exit');
    handle.proc.kill();
  }
  clearInterval(handle.timer);
};

////////// Watching dependencies  //////////

// deps is the data from dependencies.json in the bundle
// app_dir is the root of the app
// relativeFiles are any other files to watch, relative to the current
//   directory (eg, the --settings file)
// on_change is only fired once
var DependencyWatcher = function (
    deps, app_dir, relativeFiles, library, on_change) {
  var self = this;

  self.app_dir = app_dir;
  self.on_change = on_change;
  self.watches = {}; // path => unwatch function with no arguments
  self.last_contents = {}; // path => last contents (array of filenames)
  self.mtimes = {}; // path => last seen mtime

  // If a file is under a source_dir, and has one of the
  // source_extensions, then it's interesting.
  self.source_dirs = [self.app_dir];
  self.source_extensions = deps.extensions || [];

  // Any file under a bulk_dir is interesting. (bulk_dirs may also
  // contain individual files)
  self.bulk_dirs = [];
  // If we're running from a git checkout, we reload when "core" files like
  // server.js change.
  if (!files.usesWarehouse()) {
    _.each(deps.core || [], function (filepath) {
      self.bulk_dirs.push(path.join(files.getCurrentToolsDir(), filepath));
    });
  }
  _.each(deps.app || [], function (filepath) {
    self.bulk_dirs.push(path.join(self.app_dir, filepath));
  });

  // Additional list of specific files that are interesting.
  self.specific_files = {};
  for (var pkg in (deps.packages || {})) {
    // We only watch for changes in local packages, rather than ones in the
    // warehouse, since only changes to local ones need to cause an app to
    // reload. Notably, the app will *not* reload the first time a local package
    // is created which overrides an installed package.
    var localPackageDir = library.directoryForLocalPackage(pkg);
    if (localPackageDir) {
      _.each(deps.packages[pkg], function (file) {
        self.specific_files[path.join(localPackageDir, file)] = true;
      });
    }
  };

  _.each(relativeFiles, function (file) {
    self.specific_files[file] = true;
  });

  // Things that are never interesting.
  self.exclude_patterns = _.map((deps.exclude || []), function (pattern) {
    return new RegExp(pattern);
  });
  self.exclude_paths = [
    path.join(app_dir, '.meteor', 'local'),
    // For app packages, we only watch files explicitly used by the package (in
    // specific_files)
    path.join(app_dir, 'packages')
  ];

  // Start monitoring
  _.each(_.union(self.source_dirs, self.bulk_dirs, _.keys(self.specific_files)),
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
    self.on_change = null;
    for (var filepath in self.watches)
      self.watches[filepath](); // unwatch
    self.watches = {};
  },

  _fire: function () {
    var self = this;
    if (self.on_change) {
      var f = self.on_change;
      self.on_change = null;
      f();
      self.destroy();
    }
  },

  // initial is true on the inital scan, to suppress notifications
  _scan: function (initial, filepath) {
    var self = this;

    if (self._is_excluded(filepath))
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
    var is_interesting = self._is_interesting(filepath);
    if (!initial && is_interesting) {
      self._fire();
      return;
    }

    if (!stats) {
      // A directory (or an uninteresting file) was removed
      var unwatch = self.watches[filepath];
      unwatch && unwatch();
      delete self.watches[filepath];
      delete self.last_contents[filepath];
      delete self.mtimes[filepath];
      return;
    }

    // If we're seeing this file or directory for the first time,
    // monitor it if necessary
    if (!(filepath in self.watches) &&
        (is_interesting || stats.isDirectory())) {
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
      var old_contents = self.last_contents[filepath] || [];
      var new_contents = fs.readdirSync(filepath);
      var added = _.difference(new_contents, old_contents);

      self.last_contents[filepath] = new_contents;
      _.each(added, function (child) {
        self._scan(initial, path.join(filepath, child));
      });
    }
  },

  // Should we even bother to scan/recurse into this file?
  _is_excluded: function (filepath) {
    var self = this;

    // Files we're specifically being asked to scan are never excluded. For
    // example, files from app packages (that are actually pulled in by their
    // package.js) are not excluded, but the app packages directory itself is
    // (so that other files in package directories aren't watched).
    if (filepath in self.specific_files)
      return false;

    if (_.indexOf(self.exclude_paths, filepath) !== -1)
      return true;

    var excluded_by_pattern = _.any(self.exclude_patterns, function (regexp) {
      return path.basename(filepath).match(regexp);
    });

    return excluded_by_pattern;
  },

  // Should we fire if this file changes?
  _is_interesting: function (filepath) {
    var self = this;

    if (self._is_excluded(filepath))
      return false;

    var in_any_dir = function (dirs) {
      return _.any(dirs, function (dir) {
        return filepath.slice(0, dir.length) === dir;
      });
    };

    // Specific, individual files that we want to monitor
    if (filepath in self.specific_files)
      return true;

    // Source files
    if (in_any_dir(self.source_dirs) &&
        files.findExtension(self.source_extensions, filepath))
      return true;

    // Other directories and files that are included
    if (in_any_dir(self.bulk_dirs))
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
  var outer_port = options.port || 3000;
  var inner_port = outer_port + 1;
  var mongo_port = outer_port + 2;
  var bundle_path = path.join(context.appDir, '.meteor', 'local', 'build');
  // Allow override and use of external mongo. Matches code in launch_mongo.
  var mongo_url = process.env.MONGO_URL ||
        ("mongodb://127.0.0.1:" + mongo_port + "/meteor");
  var firstRun = true;

  var deps_info = null;
  var warned_about_no_deps_info = false;

  var server_handle;
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

  var start_watching = function () {
    if (!Status.shouldRestart)
      return;
    if (deps_info) {
      if (watcher)
        watcher.destroy();

      var relativeFiles;
      if (options.settingsFile) {
        relativeFiles = [options.settingsFile];
      }

      watcher = new DependencyWatcher(deps_info, context.appDir, relativeFiles,
                                      context.library,
                                      function () {
        if (Status.crashing)
          log_to_clients({'system': "=> Modified -- restarting."});
        Status.reset();
        restart_server();
      });
    }
  };

  // Using `inFiber` since bundling can yield when loading a manifest
  // file from warehouse.meteor.com.
  var restart_server = inFiber(function () {
    Status.running = false;
    Status.listening = false;
    if (server_handle)
      kill_server(server_handle);

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

    server_log = [];

    // Make the library reload packages, in case they've changed
    context.library.flush();

    var errors = bundler.bundle(context.appDir, bundle_path, bundleOpts);

    var deps_raw;
    try {
      deps_raw =
        fs.readFileSync(path.join(bundle_path, 'dependencies.json'), 'utf8');
    } catch (e) {
      if (!warned_about_no_deps_info) {
        process.stdout.write("No dependency info in bundle. " +
                             "Filesystem monitoring disabled.\n");
        warned_about_no_deps_info = true;
      }
    }

    if (deps_raw)
      deps_info = JSON.parse(deps_raw.toString());

    if (errors) {
      log_to_clients({stdout: "=> Errors prevented startup:\n"});
      _.each(errors, function (e) {
        log_to_clients({stdout: e + "\n"});
      });

      if (!deps_info) {
        // We don't know what files to watch for changes, so we have to exit.
        process.stdout.write("\nPlease fix the problem and restart.\n");

        // XXX calling process.exit like this leaves mongod running!
        // One solution would be to try to kill mongo in this case. Or
        // we could try to bundle before we launch mongo, so in this case
        // mongo would never have been started.
        process.exit(1);
      }
      start_watching();
      Status.hard_crashed();
      return;
    }

    start_watching();
    Status.running = true;

    if (firstRun) {
      process.stdout.write("=> Meteor server running on: http://localhost:" + outer_port + "/\n");
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

    server_handle = start_server({
      bundlePath: bundle_path,
      outerPort: outer_port,
      innerPort: inner_port,
      mongoURL: mongo_url,
      onExit: function (code) {
        // on server exit
        Status.running = false;
        Status.listening = false;
        Status.code = code;
        Status.soft_crashed();
        if (!Status.crashing)
          restart_server();
      },
      onListen: function () {
        // on listen
        Status.listening = true;
        _.each(request_queue, function (f) { f(); });
        request_queue = [];
      },
      nodeOptions: getNodeOptionsFromEnvironment(),
      settingsFile: options.settingsFile
    });
  });

  var mongo_err_count = 0;
  var mongo_err_timer;
  var mongo_startup_print_timer;
  var launch = function () {
    Status.mongoHandle = mongo_runner.launch_mongo(
      context.appDir,
      mongo_port,
      function () { // On Mongo startup complete
        // don't print mongo startup is slow warning.
        if (mongo_startup_print_timer) {
          clearTimeout(mongo_startup_print_timer);
          mongo_startup_print_timer = null;
        }
        restart_server();
      },
      function (code, signal) { // On Mongo dead
        if (Status.shuttingDown) {
          return;
        }
        console.log("Unexpected mongo exit code " + code + ". Restarting.");

        // if mongo dies 3 times with less than 5 seconds between each,
        // declare it failed and die.
        mongo_err_count += 1;
        if (mongo_err_count >= 3) {
          var explanation = mongoExitCodes.Codes[code];
          console.log("Can't start mongod\n");
          if (explanation)
            console.log(explanation.longText);
          if (explanation === mongoExitCodes.EXIT_NET_ERROR)
            console.log("\nCheck for other processes listening on port " + mongo_port +
                        "\nor other meteors running in the same project.");
          process.exit(1);
        }
        if (mongo_err_timer)
          clearTimeout(mongo_err_timer);
        mongo_err_timer = setTimeout(function () {
          mongo_err_count = 0;
          mongo_err_timer = null;
        }, 5000);

        // Wait a sec to restart.
        setTimeout(launch, 1000);
      });
  };

  start_proxy(outer_port, inner_port, function () {
    process.stdout.write("[[[[[ " + files.pretty_path(context.appDir) + " ]]]]]\n\n");

    mongo_startup_print_timer = setTimeout(function () {
      process.stdout.write("Initializing mongo database... this may take a moment.\n");
    }, 3000);

    updater.startUpdateChecks(context);
    launch();
  });
};
