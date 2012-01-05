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

Status = {
  running: false, // is server running now?
  crashing: false, // does server crash whenever we start it?
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

////////// Outer Proxy Server //////////
//
// calls callback once proxy is actively listening on outer and
// proxying to inner.

var start_proxy = function (outer_port, inner_port, callback) {
  callback = callback || function () {};

  var p = httpProxy.createServer(function (req, res, proxy) {
    if (Status.running) {
      // server is running. things are hunky dory!
      proxy.proxyRequest(req, res, {
        host: '127.0.0.1',
        port: inner_port
      });
    } else {
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
    }
  });

  p.on('error', function (err) {
    if (err.code == 'EADDRINUSE') {
      process.stderr.write("Can't listen on port " + outer_port
                           + ", perhaps another Meteor is running?\n");
      process.stderr.write("\n");
      process.stderr.write("Running two copies of Meteor in the same application directory\n");
      process.stderr.write("will not work.  If something else is using port " + outer_port + ", you can\n");
      process.stderr.write("specify an alternative port with --port <port>.\n");
    } else {
      process.stderr.write(err + "\n");
    }

    process.exit(1);
  });

  p.listen(outer_port, callback);
};

////////// MongoDB //////////

var launch_mongo = function (app_dir, port, launch_callback, on_exit_callback) {
  launch_callback = launch_callback || function () {};
  on_exit_callback = on_exit_callback || function () {};

  var mongod_path = path.join(files.get_dev_bundle(), 'mongodb/bin/mongod');

  // store data in app_dir
  var data_path = path.join(app_dir, '.skybreak/local/db');
  files.mkdir_p(data_path, 0755);
  var pid_path = path.join(app_dir, '.skybreak/local/mongod.pid');
  var port_path = path.join(app_dir, '.skybreak/local/mongod.port');

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

var start_server = function (bundle_path, port, mongo_url, on_exit_callback) {
  // environment
  var env = {};
  for (var k in process.env)
    env[k] = process.env[k];
  env.PORT = port;
  env.MONGO_URL = mongo_url;

  Status.running = true;
  proc = spawn(process.execPath,
               [path.join(bundle_path, 'main.js'), '--keepalive'],
               {env: env});

  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', function (data) {
    data && log_to_clients({stdout: data});
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

    Status.running = false;
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

var watch_files = function (app_dir, get_extensions, on_change) {
  var watched_files = {};

  var file_accessed = function (oldStat, newStat) {
    if (newStat.mtime.getTime() !== oldStat.mtime.getTime())
      on_change();
  };

  var consider_file = function (initial_scan, filepath) {
    // XXX maybe exclude some files?
    if (filepath in watched_files) {
      return;
    }
    watched_files[filepath] = true;

    fs.watchFile(filepath,
                 {persistant: true, interval: 500}, // poll a lot!
                 file_accessed);

    if (!initial_scan)
      on_change();
  };

  // kick off initial watch.
  files.file_list_async(app_dir, get_extensions(),
                        _.bind(consider_file, null, true));

  // watch for new files.
  setInterval(function () {
    files.file_list_async(app_dir, get_extensions(),
                        _.bind(consider_file, null, false));
  }, 5000);

  // XXX doesn't deal with removed files

  // XXX if a file is removed from the project, we will continue to
  // restart when it's updated

  // XXX if the initial scan takes more than 5000 ms to complete, it's
  // all going to come crashing down on us..
};

////////// Upgrade check //////////

// XXX this should move to main skybreak command-line, probably?
var start_update_checks = function () {
  var update_check = function () {
    updater.get_manifest(function (manifest) {
      if (manifest && updater.needs_upgrade(manifest)) {
        console.log("////////////////////////////////////////");
        console.log("////////////////////////////////////////");
        console.log();
        console.log("skybreak is out of date. Please run:");
        console.log();
        console.log("     skybreak update");
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

exports.run = function (app_dir, bundle_path, bundle_opts, port) {
  var outer_port = port || 3000;
  var inner_port = outer_port + 1;
  var mongo_port = outer_port + 2;
  var mongo_url = "mongodb://localhost:" + mongo_port + "/skybreak";

  var deps = {};
  var started_watching_files = false;
  var warned_about_no_deps_info = false;

  var server_handle;

  var bundle = function () {
    bundler.bundle(app_dir, bundle_path, bundle_opts);

    try {
      var deps_raw =
        fs.readFileSync(path.join(bundle_path, 'dependencies.json'), 'utf8');
      deps = JSON.parse(deps_raw.toString());
    } catch (e) {
      if (!warned_about_no_deps_info) {
        process.stdout.write("No dependency info in bundle. " +
                             "Filesystem monitoring disabled.\n");
        warned_about_no_deps_info = true;
      }
    }

    if (!started_watching_files) {
      // Don't start watching files until we've built the bundle for
      // the first time and have gotten the deps info out of it.
      var get_extensions = function () {
        return deps.extensions || [];
      };

      watch_files(app_dir, get_extensions, function () {
        if (Status.crashing)
          log_to_clients({'system': "=> Modified -- restarting."});
        Status.reset();
        restart_server();
      });

      started_watching_files = true;
    }
  };

  var restart_server = function () {
    if (server_handle)
      kill_server(server_handle);

    server_log = [];

    try {
      bundle();
    } catch (e) {
      log_to_clients({system: e.stack});
      Status.hard_crashed();
      return;
    }

    server_handle = start_server(bundle_path, inner_port, mongo_url, function () {
      // on server exit
      Status.soft_crashed();
      if (!Status.crashing)
        restart_server();
    });
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
