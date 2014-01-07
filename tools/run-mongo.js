var fs = require("fs");
var path = require("path");

var files = require('./files.js');
var utils = require('./utils.js');
var release = require('./release.js');
var mongoExitCodes = require('./mongo-exit-codes.js');
var inFiber = require('./fiber-helpers.js').inFiber;

var _ = require('underscore');
var unipackage = require('./unipackage.js');
var Fiber = require('fibers');
var Future = require('fibers/future');

// Find all running Mongo processes that were started by this program
// (even by other simultaneous runs of this program). If passed,
// appDir and port act as filters on the list of running mongos.
//
// Yields. Returns an object with keys pid, port, appDir.
var findMongoPids = function (appDir, port) {
  var fut = new Future;

  // 'ps ax' should be standard across all MacOS and Linux.
  var child_process = require('child_process');
  child_process.exec(
    'ps ax',
    function (error, stdout, stderr) {
      if (error) {
        fut['throw'](new Error("Couldn't run ps ax: " + JSON.stringify(error)));
        return;
      }

      var ret = [];
      _.each(stdout.split('\n'), function (line) {
        // matches mongos we start.
        var m = line.match(/^\s*(\d+).+mongod .+--port (\d+) --dbpath (.+)(?:\/|\\)\.meteor(?:\/|\\)local(?:\/|\\)db(?: |$)/);
        if (m && m.length === 4) {
          var foundPid =  parseInt(m[1]);
          var foundPort = parseInt(m[2]);
          var foundPath = m[3];

          if ( (! port || port === foundPort) &&
               (! appDir || appDir === foundPath)) {
            ret.push({
              pid: foundPid,
              port: foundPort,
              appDir: foundPath
            });
          }
        }
      });

      fut['return'](ret);
    });

  return fut.wait();
};


// See if mongo is running already. Yields. Returns the port that
// mongo is running on or null if mongo is not running.
var findMongoPort = function (appDir) {
  var pids = findMongoPids(appDir);

  if (pids.length !== 1) {
    return null;
  }

  var pid = pids[0].pid;
  try {
    process.kill(pid, 0); // make sure it is still alive
  } catch (e) {
    return null;
  }

  return pids[0].port;
};


// Kill any other mongos running on our port. Yields, and returns once
// they are all dead. Throws an exception on failure.
//
// This is a big hammer for dealing with still running mongos, but
// smaller hammers have failed before and it is getting tiresome.
var find_mongo_and_kill_it_dead = function (port) {
  var pids = findMongoPids(null, port);

  if (! pids.length)
    return; // nothing to kill

  // Go through the list serially. There really should only ever be
  // one but we're not taking any chances.
  _.each(pids, function (processInfo) {
    var pid = processInfo.pid;

    // Send kill attempts and wait. First a SIGINT, then if it isn't
    // dead within 2 sec, SIGKILL. Check every 100ms to see if it's
    // dead.
    for (var attempts = 1; attempts <= 40; attempts ++) {
      var signal = 0;
      if (attempts === 1)
        signal = 'SIGINT';
      else if (attempts === 20 || attempts === 30)
        signal = 'SIGKILL';

      try {
        process.kill(pid, signal);
      } catch (e) {
        // it's dead. on to the next one
        return;
      }

      utils.sleep(100);
    }

    // give up after 4 seconds.
    // XXX should actually catch this higher up and print a nice
    // error. foreseeable conditions should never result in exceptions
    // for the user.
    throw new Error("Can't kill running mongo (pid " + pid + ").");
  });
};

var launchMongo = function (options) {
  var onListen = options.onListen || function () {};
  var onExit = options.onExit || function () {};

  var mongod_path = path.join(
    files.getDevBundle(), 'mongodb', 'bin', 'mongod');

  // store data in appDir
  var dbPath = path.join(options.appDir, '.meteor', 'local', 'db');
  files.mkdir_p(dbPath, 0755);
  // add .gitignore if needed.
  files.addToGitignore(path.join(options.appDir, '.meteor'), 'local');

  // There is a race here -- we want to return a handle immediately,
  // but we're not actually ready to service calls to handle.stop()
  // until Mongo has actually started up. For now, resolve that by
  // ignoring the call to stop.
  var handle = {
    stop: function (callback) { callback(); }
  };

  Fiber(function () {
    find_mongo_and_kill_it_dead(options.port);

    var portFile = path.join(dbPath, 'METEOR-PORT');
    var createReplSet = true;
    try {
      createReplSet = +(fs.readFileSync(portFile)) !== options.port;
    } catch (e) {
      if (!e || e.code !== 'ENOENT')
        throw e;
    }

    // If this is the first time we're using this DB, or we changed
    // port since the last time, then we want to destroying any
    // existing replSet configuration and create a new one. First we
    // delete the "local" database if it exists. (It's a pain and slow
    // to change the port in an existing replSet configuration. It's
    // also a little slow to initiate a new replSet, thus the attempt
    // to not do it unless the port changes.)
    if (createReplSet) {
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
        library: release.current.library,
        packages: [ 'mongo-livedata' ],
        release: release.current.name,
      })['mongo-livedata'].MongoInternals.NpmModule;
    }

    // Start mongod with a dummy replSet and wait for it to listen.
    var child_process = require('child_process');
    var replSetName = 'meteor';
    var proc = child_process.spawn(mongod_path, [
      // nb: cli-test.sh and findMongoPids make strong assumptions about the
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
      proc.removeListener('exit', callOnExit);
      proc.kill('SIGINT');
      callback && callback(err);
    };

    proc.stdout.setEncoding('utf8');
    var listening = false;
    var replSetReady = false;
    var maybeCallOnListen = function () {
      if (listening && replSetReady) {
        if (createReplSet)
          fs.writeFileSync(portFile, options.port);
        onListen();
      }
    };
    proc.stdout.on('data', function (data) {
      if (/ \[initandlisten\] waiting for connections on port/.test(data)) {
        if (createReplSet) {
          // Connect to it and start a replset.
          var db = new mongoNpmModule.Db(
            'meteor', new mongoNpmModule.Server('127.0.0.1', options.port),
            {safe: true});
          db.open(function (err, db) {
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
              db.close(true);
            });
          });
        }
        listening = true;
        maybeCallOnListen();
      }

      if (/ \[rsMgr\] replSet PRIMARY/.test(data)) {
        replSetReady = true;
        maybeCallOnListen();
      }
    });
  }).run();

  return handle;
};


// This runs a Mongo process and restarts it whenever it fails. If it
// restarts too often, we give up on restarting it, diagnostics are
// logged, and onFailure is called.
//
// options: appDir, port, runLog, onFailure
var MongoRunner = function (options) {
  var self = this;

  self.appDir = options.appDir;
  self.port = options.port;
  self.runLog = options.runLog;
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
  // restarted; we won't tell you about that.) Returns true if we were
  // able to get it to start at least once.
  //
  // If the server fails to start for the first time (after a few
  // restarts), we'll print a message and give up, returning false.
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
    return self.startupFuture.wait();
  },

  _startOrRestart: function () {
    var self = this;

    if (self.handle)
      throw new Error("already running?");

    self.handle = launchMongo({
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
          self.startupFuture['return'](true);
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
    self.runLog.log(
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
    // diagnostics and give up.
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

    self.runLog.log(message);
    self.onFailure && self.onFailure();

    if (self.startupFuture) {
      // start() is still blocking.. make it return
      self.startupFuture['return'](false);
      self.startupFuture = null;
    }
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


exports.findMongoPort = findMongoPort;
exports.MongoRunner = MongoRunner;
