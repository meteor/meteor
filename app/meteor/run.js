////////// Requires //////////

var fs = require("fs");
var path = require("path");
var spawn = require('child_process').spawn;

var socketio = require('socket.io');
var httpProxy = require('http-proxy');

var files = require('../lib/files.js');
var updater = require('../lib/updater.js');
var bundler = require('../lib/bundler.js');

var _ = require('../lib/third/underscore.js');

////////// Globals //////////

// list of log objects from the child process.
var server_log = [];

var Status = {
  running: false, // is server running now?
  crashing: false, // does server crash whenever we start it?
  listening: false, // do we expect the server to be listening now.
  counter: 0, // how many crashes in rapid succession

  reset: function () {
    this.crashing = false;
    this.counter = 0;
  },

  hard_crashed: function () {
    log_to_clients({'exit': "Your application is crashing. Waiting for file change."});
    this.crashing = true;
  },

  soft_crashed: function () {
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

      res.write("Your app is crashed. Here's the latest log.\n\n");

      _.each(server_log, function(log) {
        _.each(log, function(val, key) {
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

var launch_mongo = function (app_dir, port, launch_callback, on_exit_callback) {
  launch_callback = launch_callback || function () {};
  on_exit_callback = on_exit_callback || function () {};

  // If we are passed an external mongo, assume it is launched and never
  // exits. Matches code in exports.run.
  if (process.env.MONGO_URL) {
    launch_callback();
    return;
  }

  var mongod_path = path.join(files.get_dev_bundle(), 'mongodb/bin/mongod');

  // store data in app_dir
  var data_path = path.join(app_dir, '.meteor/local/db');
  files.mkdir_p(data_path, 0755);
  var pid_path = path.join(app_dir, '.meteor/local/mongod.pid');
  var port_path = path.join(app_dir, '.meteor/local/mongod.port');
  // add .gitignore if needed.
  files.add_to_gitignore(path.join(app_dir, '.meteor'), 'local');

  // read old pid file, kill old process.
  var pid;
  try {
    var pid_data = parseInt(fs.readFileSync(pid_path));
    if (pid_data) {
      // found old mongo. killing it. will raise if already dead.
      pid = pid_data;
      process.kill(pid);
      console.log("Killing old mongod " + pid);
    }
  } catch (e) {
    // no pid, or no longer running. no worries.
  }

  // We need to wait for mongo to fully die, so define a callback
  // function for launch.
  var _launch = function () {
    var proc = spawn(mongod_path, [
      '--bind_ip', '127.0.0.1', '--port', port,
      '--dbpath', data_path
    ]);

    // write pid and port file.
    fs.writeFileSync(pid_path, proc.pid.toString(), 'ascii');
    fs.writeFileSync(port_path, port.toString(), 'ascii');

    proc.on('exit', function (code, signal) {
      console.log("XXX MONGO DEAD! " + code + " : " + signal); // XXX
      on_exit_callback();
    });

    // proc.stderr.setEncoding('utf8');
    // proc.stderr.on('data', function (data) {
    //   process.stdout.write(data);
    // });

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', function (data) {
      // process.stdout.write(data);
      if (/ \[initandlisten\] waiting for connections on port/.test(data))
        launch_callback();
    });

    // XXX deal with unclean death.
  };

  if (!pid) {
    // no mongo running, launch new one
    _launch();
  } else {
    // Ensure mongo is really dead.
    // XXX super ugly.
    var attempts = 0;
    var dead_yet = function () {
      setTimeout(function () {
        attempts = attempts + 1;
        var signal = 0;
        // try to kill -9 it twice, once at 1 second, once at 10 seconds
        if (attempts === 10 || attempts === 20)
          signal = 'SIGKILL';
        try {
          process.kill(pid, signal);
        } catch (e) {
          // it's dead. launch and we're done
          _launch();
          return;
        }
        if (attempts === 30) {
          // give up after 3 seconds.
          process.stdout.write(
            "Can't kill running mongo (pid " + pid + "). Aborting.\n");
          process.exit(1);
        }

        // recurse
        dead_yet();
      }, 100);
    };
    dead_yet();
  }
};

var log_to_clients = function (msg) {
  server_log.push(msg);
  if (server_log.length > 100) {
    server_log.shift();
  }

  // log to console
  //
  // XXX this is a mess. some lines have newlines some don't.  this
  // whole thing should be redone. it is the result of doing it very
  // differently and changing over quickly.
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

var start_server = function (bundle_path, port, mongo_url,
                             on_exit_callback, on_listen_callback) {
  // environment
  var env = {};
  for (var k in process.env)
    env[k] = process.env[k];
  env.PORT = port;
  env.MONGO_URL = mongo_url;

  var proc = spawn(process.execPath,
                   [path.join(bundle_path, 'main.js'), '--keepalive'],
                   {env: env});

  // XXX deal with test server logging differently?!

  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', function (data) {
    if (!data) return;

    // string must match server.js
    if (data.match(/^LISTENING\s*$/)) {
      on_listen_callback && on_listen_callback();
    } else {
      log_to_clients({stdout: data});
    }
  });

  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', function (data) {
    data && log_to_clients({stderr: data});
  });

  proc.on('exit', function (code, signal) {
    if (signal) {
      log_to_clients({'exit': 'Exited from signal: ' + signal});
    } else {
      log_to_clients({'exit': 'Exited with code: ' + code});
    }

    on_exit_callback();
  });

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
// on_change is only fired once
var DependencyWatcher = function (deps, app_dir, on_change) {
  var self = this;

  self.app_dir = app_dir;
  self.on_change = on_change;
  self.watches = {}; // path => fs.watch handle
  self.last_contents = {}; // path => last contents (array of filenames)
  self.mtimes = {}; // path => last seen mtime

  // If a file is under a source_dir, and has one of the
  // source_extensions, then it's interesting.
  self.source_dirs = [self.app_dir];
  self.source_extensions = deps.extensions || [];

  // Any file under a bulk_dir is interesting. (bulk_dirs may also
  // contain individual files)
  self.bulk_dirs = [];
  _.each(deps.core || [], function (filepath) {
    self.bulk_dirs.push(path.join(files.get_core_dir(), filepath));
  });
  _.each(deps.app || [], function (filepath) {
    self.bulk_dirs.push(path.join(self.app_dir, filepath));
  });

  // Additional list of specific files that are interesting.
  self.specific_files = {};
  for (var pkg in (deps.packages || {})) {
    _.each(deps.packages[pkg], function (file) {
      self.specific_files[path.join(files.get_package_dir(), pkg, file)]
        = true;
    });
  };

  // Things that are never interesting.
  self.exclude_patterns = _.map((deps.exclude || []), function (pattern) {
    return new RegExp(pattern);
  });
  self.exclude_paths = [
    path.join(app_dir, '.meteor', 'local')
  ];

  // Start monitoring
  _.each(_.union(self.source_dirs, self.bulk_dirs, _.keys(self.specific_files)),
         _.bind(self._scan, self, true));
};

_.extend(DependencyWatcher.prototype, {
  // stop monitoring
  destroy: function () {
    var self = this;
    self.on_change = function () {};
    for (var filepath in self.watches)
      self.watches[filepath].close();
    self.watches = {};
  },

  // initial is true on the inital scan, to suppress notifications
  _scan: function (initial, filepath) {
    var self = this;

    if (self._is_excluded(filepath))
      return false;

    try {
      var stats = fs.lstatSync(filepath)
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
      self.on_change();
      self.destroy();
      return;
    }

    if (!stats) {
      // A directory (or an uninteresting file) was removed
      var watcher = self.watches[filepath];
      if (watcher)
        watcher.close();
      delete self.watches[filepath];
      delete self.last_contents[filepath];
      delete self.mtimes[filepath];
      return;
    }

    // If we're seeing this file or directory for the first time,
    // monitor it if necessary
    if (!(filepath in self.watches) &&
        (is_interesting || stats.isDirectory())) {
      self.watches[filepath] =
        fs.watch(filepath, {interval: 500}, // poll a lot!
                 _.bind(self._scan, self, false, filepath));
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
        _.indexOf(self.source_extensions, path.extname(filepath)) !== -1)
      return true;

    // Other directories and files that are included
    if (in_any_dir(self.bulk_dirs))
      return true;

    return false;
  }
});

////////// Upgrade check //////////

// XXX this should move to main meteor command-line, probably?
var start_update_checks = function () {
  var update_check = function () {
    updater.get_manifest(function (manifest) {
      if (manifest && updater.needs_upgrade(manifest)) {
        console.log("////////////////////////////////////////");
        console.log("////////////////////////////////////////");
        console.log();
        console.log("meteor is out of date. Please run:");
        console.log();
        console.log("     meteor update");
        console.log();
        console.log("////////////////////////////////////////");
        console.log("////////////////////////////////////////");
      }
    });
  };
  setInterval(update_check, 12*60*60*1000); // twice a day
  update_check(); // and now.
}

///////////////////////////////////////////////////////////////////////////////

// XXX leave a pidfile and check if we are already running

// This function never returns and will call process.exit() if it
// can't continue. If you change this, remember to call
// watcher.destroy() as appropriate.
exports.run = function (app_dir, bundle_opts, port) {
  var outer_port = port || 3000;
  var inner_port = outer_port + 1;
  var mongo_port = outer_port + 2;
  var test_port = outer_port + 3;
  var bundle_path = path.join(app_dir, '.meteor/local/build');
  var test_bundle_path = path.join(app_dir, '.meteor/local/build_test');
  // Allow override and use of external mongo. Matches code in launch_mongo.
  var mongo_url = process.env.MONGO_URL ||
        ("mongodb://localhost:" + mongo_port + "/meteor");
  var test_mongo_url = "mongodb://localhost:" + mongo_port + "/meteor_test";

  var test_bundle_opts;
  if (files.is_app_dir(app_dir)) {
    // If we're an app, make separate test_bundle_opts to trigger a
    // separate runner.

    // XXX test_bundle_opts = _.extend({include_tests: true}, bundle_opts);
    // Disable app dir testing for now! It is not fully developed and we
    // don't want to burden users yet.
  } else {
    // Otherwise we're running in a package directory, run the tests as
    // the main app (so we get reload watching and such).
    bundle_opts = _.extend({include_tests: true}, bundle_opts);
  }

  var deps_info = null;
  var warned_about_no_deps_info = false;

  var server_handle;
  var test_server_handle;
  var watcher;

  var bundle = function () {
    bundler.bundle(app_dir, bundle_path, bundle_opts);

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
  };

  var start_watching = function () {
    if (deps_info) {
      if (watcher)
        watcher.destroy();

      watcher = new DependencyWatcher(deps_info, app_dir, function () {
        if (Status.crashing)
          log_to_clients({'system': "=> Modified -- restarting."});
        Status.reset();
        restart_server();
      });
    }
  };

  var restart_server = function () {
    Status.running = false;
    Status.listening = false;
    if (server_handle)
      kill_server(server_handle);
    if (test_server_handle)
      kill_server(test_server_handle);

    server_log = [];

    try {
      bundle();
    } catch (e) {
      log_to_clients({system: e.stack});
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
    server_handle = start_server(bundle_path, inner_port, mongo_url, function () {
      // on server exit
      Status.running = false;
      Status.listening = false;
      Status.soft_crashed();
      if (!Status.crashing)
        restart_server();
    }, function () {
      // on listen
      Status.listening = true;
      _.each(request_queue, function (f) { f(); });
      request_queue = [];
    });


    // launch test bundle and server if needed.
    if (test_bundle_opts) {
      try {
        bundler.bundle(app_dir, test_bundle_path, test_bundle_opts);
        test_server_handle = start_server(
          test_bundle_path, test_port, test_mongo_url, function () {
            // No restarting or crash loop prevention on the test server
            // for now. We'll see how annoying it is.
            log_to_clients({'system': "Test server crashed."});
          });
      } catch (e) {
        log_to_clients({'system': "Test bundle failure."});
      }

    };
  };

  var launch = function () {
    launch_mongo(app_dir, mongo_port,
                 function () { // On Mongo startup complete
                   restart_server();
                 },
                 function () { // On Mongo dead
                   // XXX wait a sec to restart.
                   setTimeout(launch, 1000);
                 });
  };

  start_proxy(outer_port, inner_port, function () {
    process.stdout.write("[[[[[ " + files.pretty_path(app_dir) + " ]]]]]\n\n");
    process.stdout.write("Running on: http://localhost:" + outer_port + "/\n");

    if (!files.in_checkout())
      start_update_checks();

    launch();
  });
};
