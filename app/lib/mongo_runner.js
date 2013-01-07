var fs = require("fs");
var path = require("path");
var child_process = require('child_process');

var files = require(path.join(__dirname, '..', 'lib', 'files.js'));

var _ = require('underscore');


/** Internal.
 *
 * If passed, app_dir and port act as filters on the list of running mongos.
 *
 * callback is called with (err, [{pid, port, app_dir}])
 */
var find_mongo_pids = function (app_dir, port, callback) {
  // 'ps ax' should be standard across all MacOS and Linux.
  child_process.exec('ps ax',
    function (error, stdout, stderr) {
      if (error) {
        callback({reason: error});
      } else if (stderr) {
        callback({reason: 'ps produced stderr ' + stderr});
      } else {
        var pids = [];

        _.each(stdout.split('\n'), function (ps_line) {
          // matches mongos we start.
          var m = ps_line.match(/^\s*(\d+).+mongod .+--port (\d+) --dbpath (.+)(?:\/|\\)\.meteor(?:\/|\\)local(?:\/|\\)db\s*$/);
          if (m && m.length === 4) {
            var found_pid =  parseInt(m[1]);
            var found_port = parseInt(m[2]);
            var found_path = m[3];

            if ( (!port || port === found_port) &&
                 (!app_dir || app_dir === found_path)) {
              pids.push({
                pid: found_pid, port: found_port, app_dir: found_path});
            }
          }
        });

        callback(null, pids);
      }
    });
};


// See if mongo is running already. Callback takes a single argument,
// 'port', which is the port mongo is running on or null if mongo is not
// running.
exports.find_mongo_port = function (app_dir, callback) {
  find_mongo_pids(app_dir, null, function (err, pids) {
    if (err || pids.length !== 1) {
      callback(null);
      return;
    }

    var pid = pids[0].pid;
    try {
      process.kill(pid, 0); // make sure it is still alive
    } catch (e) {
      callback(null);
      return;
    }

    callback(pids[0].port);
  });
}


// Try to kill any other mongos running on our port. Calls callback
// once they are all gone. Callback takes one arg: err (falsy means all
// good).
//
// This is a big hammer for dealing with still running mongos, but
// smaller hammers have failed before and it is getting tiresome.
var find_mongo_and_kill_it_dead = function (port, callback) {
  find_mongo_pids(null, port, function (err, pids) {
    if (err) {
      callback(err);
      return;
    }

    if (pids.length) {
      // Send kill attempts and wait. First a SIGINT, then if it isn't
      // dead within 2 sec, SIGKILL. This goes through the list
      // serially, but thats OK because there really should only ever be
      // one.
      var attempts = 0;
      var dead_yet = function () {
        attempts = attempts + 1;
        var pid = pids[0].pid;
        var signal = 0;
        if (attempts === 1)
          signal = 'SIGINT';
        else if (attempts === 20 || attempts === 30)
          signal = 'SIGKILL';
        try {
          process.kill(pid, signal);
        } catch (e) {
          // it's dead. remove this pid from the list.
          pids.shift();

          // if no more in the list, we're done!
          if (!pids.length) {
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
  });
};

exports.launch_mongo = function (app_dir, port, launch_callback, on_exit_callback) {
  var handle = {stop: function (callback) { callback(); } };
  launch_callback = launch_callback || function () {};
  on_exit_callback = on_exit_callback || function () {};

  // If we are passed an external mongo, assume it is launched and never
  // exits. Matches code in run.js:exports.run.

  // Since it is externally managed, asking it to actually stop would be
  // impolite, so our stoppable handle is a noop
  if (process.env.MONGO_URL) {
    launch_callback();
    return handle;
  }

  var mongod_path = path.join(files.get_dev_bundle(),
                              'mongodb',
                              'bin',
                              'mongod');

  // store data in app_dir
  var data_path = path.join(app_dir, '.meteor', 'local', 'db');
  files.mkdir_p(data_path, 0755);
  // add .gitignore if needed.
  files.add_to_gitignore(path.join(app_dir, '.meteor'), 'local');

  find_mongo_and_kill_it_dead(port, function (err) {
    if (err) {
      launch_callback({reason: "Can't kill running mongo: " + err.reason});
      return;
    }

    var proc = child_process.spawn(mongod_path, [
      '--bind_ip', '127.0.0.1',
      '--smallfiles',
      '--port', port,
      '--dbpath', data_path
    ]);
    handle.stop = function (callback) {
      var tries = 0;
      var exited = false;
      proc.removeListener('exit', on_exit_callback);
      proc.kill('SIGINT');
      callback && callback(err);
    };

    proc.on('exit', on_exit_callback);

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', function (data) {
      // process.stdout.write(data);
      if (/ \[initandlisten\] waiting for connections on port/.test(data))
        launch_callback();
    });
  });
  return handle;
};
