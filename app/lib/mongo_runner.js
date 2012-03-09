var fs = require("fs");
var path = require("path");
var spawn = require('child_process').spawn;

var files = require('../lib/files.js');

var _ = require('../lib/third/underscore.js');


// See if mongo is running already. If so, return the current port. If
// not, return null.
exports.find_mongo_port = function (app_dir) {
  var pid_path = path.join(app_dir, '.meteor/local/mongod.pid');
  var port_path = path.join(app_dir, '.meteor/local/mongod.port');
  var port;

  try {
    var pid_data = parseInt(fs.readFileSync(pid_path));
    process.kill(pid_data, 0); // make sure it is still alive
    port = parseInt(fs.readFileSync(port_path));
  } catch (e) {
    return null;
  }

  return port;
};



// Try to kill any other mongos running on our port. Calls callback
// once they are all gone. Callback takes one arg: err (falsy means all
// good).
//
// This is a big hammer for dealing with still running mongos, but
// smaller hammers have failed before and it is getting tiresome.
var find_mongo_and_kill_it_dead = function (port, callback) {
  var proc = spawn('ps', ['ax']);
  var data = '';
  proc.stdout.on('data', function (d) {
    data += d;
  });

  proc.on('exit', function (code, signal) {
    if (code === 0) {
      var kill_pids = [];

      _.each(data.split('\n'), function (ps_line) {
        // matches mongos we start
        var m = ps_line.match(/^\s*(\d+).+mongod .+--port (\d+) --dbpath (.+\.meteor\/local\/db)\s*$/);
        if (m && m.length === 4) {
          var found_pid =  m[1];
          var found_port = m[2];

          if (port === parseInt(found_port)) {
            kill_pids.push(found_pid);
          }
        }
      });


      if (kill_pids.length) {
        // Send kill attempts and wait. First a SIGINT, then if it isn't
        // dead within 2 sec, SIGKILL. This goes through the list
        // serially, but thats OK because there really should only ever be
        // one.
        var attempts = 0;
        var dead_yet = function () {
          attempts = attempts + 1;
          var pid = kill_pids[0];
          var signal = 0;
          if (attempts === 1)
            signal = 'SIGINT';
          else if (attempts === 20 || attempts === 30)
            signal = 'SIGKILL';
          try {
            process.kill(pid, signal);
          } catch (e) {
            // it's dead. remove this pid from the list.
            kill_pids.shift();

            // if no more in the list, we're done!
            if (!kill_pids.length) {
              callback();
              return;
            }
          }
          if (attempts === 40) {
            // give up after 4 seconds.
            callback({
              reason: "Can't kill running mongo (pid " + pid + ")."});
            return;
          }

          // recurse
          setTimeout(dead_yet, 100);
        };
        dead_yet();

      } else {
        // nothing to kill, fire OK callback
        callback();
      }
    } else {
      callback({reason: 'ps exit code ' + code});
    }
  });
};

exports.launch_mongo = function (app_dir, port, launch_callback, on_exit_callback) {
  launch_callback = launch_callback || function () {};
  on_exit_callback = on_exit_callback || function () {};

  // If we are passed an external mongo, assume it is launched and never
  // exits. Matches code in run.js:exports.run.
  if (process.env.MONGO_URL) {
    launch_callback();
    return;
  }

  var mongod_path = path.join(files.get_dev_bundle(), 'mongodb/bin/mongod');

  // store data in app_dir
  var data_path = path.join(app_dir, '.meteor/local/db');
  files.mkdir_p(data_path, 0755);
  var port_path = path.join(app_dir, '.meteor/local/mongod.port');
  // add .gitignore if needed.
  files.add_to_gitignore(path.join(app_dir, '.meteor'), 'local');

  find_mongo_and_kill_it_dead(port, function (err) {
    if (err) {
      launch_callback({reason: "Can't kill running mongo: " + err.reason});
      return;
    }

    var proc = spawn(mongod_path, [
      '--bind_ip', '127.0.0.1', '--port', port,
      '--dbpath', data_path
    ]);

    // write port file.
    fs.writeFileSync(port_path, port.toString(), 'ascii');

    proc.on('exit', function (code, signal) {
      on_exit_callback(code, signal);
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
  });

};

