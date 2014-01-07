var fs = require("fs");
var path = require("path");

var files = require('./files.js');

var _ = require('underscore');
var unipackage = require('./unipackage.js');
var Fiber = require('fibers');

/** Internal.
 *
 * If passed, app_dir and port act as filters on the list of running mongos.
 *
 * callback is called with (err, [{pid, port, app_dir}])
 */
var find_mongo_pids = function (app_dir, port, callback) {
  // 'ps ax' should be standard across all MacOS and Linux.
  var child_process = require('child_process');
  child_process.exec('ps ax',
    function (error, stdout, stderr) {
      if (error) {
        callback({reason: error});
      } else {
        var pids = [];

        _.each(stdout.split('\n'), function (ps_line) {
          // matches mongos we start.
          var m = ps_line.match(/^\s*(\d+).+mongod .+--port (\d+) --dbpath (.+)(?:\/|\\)\.meteor(?:\/|\\)local(?:\/|\\)db(?: |$)/);
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

exports.launchMongo = function (options) {
  var handle = {stop: function (callback) { callback(); } };
  var onListen = options.onListen || function () {};
  var onExit = options.onExit || function () {};

  // If we are passed an external mongo, assume it is launched and never
  // exits. Matches code in run.js:exports.run.

  // Since it is externally managed, asking it to actually stop would be
  // impolite, so our stoppable handle is a noop
  if (process.env.MONGO_URL) {
    onListen();
    return handle;
  }

  var mongod_path = path.join(files.get_dev_bundle(),
                              'mongodb',
                              'bin',
                              'mongod');

  // store data in app_dir
  var dbPath = path.join(options.context.appDir, '.meteor', 'local', 'db');
  files.mkdir_p(dbPath, 0755);
  // add .gitignore if needed.
  files.add_to_gitignore(path.join(options.context.appDir, '.meteor'), 'local');

  find_mongo_and_kill_it_dead(options.port, function (err) {
    Fiber(function (){
      if (err) {
        // XXX this was being passed to onListen and ignored before. should do
        // something better.
        throw {reason: "Can't kill running mongo: " + err.reason};
      }

      var portFile = path.join(dbPath, 'METEOR-PORT');
      var portFileExists = false;
      var createReplSet = true;
      try {
        createReplSet = +(fs.readFileSync(portFile)) !== options.port;
        portFileExists = true;
      } catch (e) {
        if (!e || e.code !== 'ENOENT')
          throw e;
      }

      // If this is the first time we're using this DB, or we changed port since
      // the last time, then we want to destroying any existing replSet
      // configuration and create a new one. First we delete the "local" database
      // if it exists. (It's a pain and slow to change the port in an existing
      // replSet configuration. It's also a little slow to initiate a new replSet,
      // thus the attempt to not do it unless the port changes.)
      if (createReplSet) {
        // Delete the port file, so we don't mistakenly believe that the DB is
        // still configured.
        if (portFileExists)
          fs.unlinkSync(portFile);

        try {
          var dbFiles = fs.readdirSync(dbPath);
        } catch (e) {
          if (!e || e.code !== 'ENOENT')
            throw e;
        }
        _.each(dbFiles, function (dbFile) {
          if (/^local\./.test(dbFile))
            fs.unlinkSync(path.join(dbPath, dbFile));
        });

        // Load mongo-livedata so we'll be able to talk to it.
        var mongoNpmModule = unipackage.load({
          library: options.context.library,
          packages: [ 'mongo-livedata' ],
          release: options.context.releaseVersion
        })['mongo-livedata'].MongoInternals.NpmModule;
      }

      // Start mongod with a dummy replSet and wait for it to listen.
      var child_process = require('child_process');
      var replSetName = 'meteor';
      var proc = child_process.spawn(mongod_path, [
        // nb: cli-test.sh and find_mongo_pids make strong assumptions about the
        // order of the arguments! Check them before changing any arguments.
        '--bind_ip', '127.0.0.1',
        '--smallfiles',
        '--nohttpinterface',
        '--port', options.port,
        '--dbpath', dbPath,
        // Use an 8MB oplog rather than 256MB. Uses less space on disk and
        // initializes faster. (Not recommended for production!)
        '--oplogSize', '8',
        '--replSet', replSetName
      ]);

      var stderrOutput = '';
      proc.stderr.setEncoding('utf8');
      proc.stderr.on('data', function (data) {
        stderrOutput += data;
      });

      var callOnExit = function (code, signal) {
        onExit(code, signal, stderrOutput);
      };
      proc.on('exit', callOnExit);

      handle.stop = function (callback) {
        var tries = 0;
        var exited = false;
        proc.removeListener('exit', callOnExit);
        proc.kill('SIGINT');
        callback && callback(err);
      };

      proc.stdout.setEncoding('utf8');
      var listening = false;
      var replSetReady = false;
      var replSetReadyToBeInitiated = false;
      var alreadyInitiatedReplSet = false;
      var alreadyCalledOnListen = false;
      var maybeCallOnListen = function () {
        if (listening && replSetReady && !alreadyCalledOnListen) {
          if (createReplSet)
            fs.writeFileSync(portFile, options.port);
          alreadyCalledOnListen = true;
          onListen();
        }
      };

      var maybeInitiateReplset = function () {
        // We need to want to create a replset, be confident that the server is
        // listening, be confident that the server's replset implementation is
        // ready to be initiated, and have not already done it.
        if (!(createReplSet && listening && replSetReadyToBeInitiated
              && !alreadyInitiatedReplSet)) {
          return;
        }

        alreadyInitiatedReplSet = true;

        // Connect to it and start a replset.
        var db = new mongoNpmModule.Db(
          'meteor', new mongoNpmModule.Server('127.0.0.1', options.port),
          {safe: true});
        db.open(function(err, db) {
          if (err)
            throw err;
          db.admin().command({
            replSetInitiate: {
              _id: replSetName,
              members: [{_id : 0, host: '127.0.0.1:' + options.port}]
            }
          }, function (err, result) {
            if (err)
              throw err;
            // why this isn't in the error is unclear.
            if (result && result.documents && result.documents[0]
                && result.documents[0].errmsg) {
              throw result.document[0].errmsg;
            }
            db.close(true);
          });
        });
      };

      proc.stdout.on('data', function (data) {
        // note: don't use "else ifs" in this, because 'data' can have multiple
        // lines
        if (/config from self or any seed \(EMPTYCONFIG\)/.test(data)) {
          replSetReadyToBeInitiated = true;
          maybeInitiateReplset();
        }

        if (/ \[initandlisten\] waiting for connections on port/.test(data)) {
          listening = true;
          maybeInitiateReplset();
          maybeCallOnListen();
        }

        if (/ \[rsMgr\] replSet PRIMARY/.test(data)) {
          replSetReady = true;
          maybeCallOnListen();
        }
      });
    }).run();
  });
  return handle;
};
