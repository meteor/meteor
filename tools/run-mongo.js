var fs = require("fs");
var path = require("path");

var files = require('./files.js');
var utils = require('./utils.js');
var release = require('./release.js');
var mongoExitCodes = require('./mongo-exit-codes.js');
var fiberHelpers = require('./fiber-helpers.js');
var inFiber = fiberHelpers.inFiber;
var runLog = require('./run-log.js');

var _ = require('underscore');
var unipackage = require('./unipackage.js');
var Fiber = require('fibers');
var Future = require('fibers/future');

// Given a Mongo URL, open an interative Mongo shell on this terminal
// on that database.
var runMongoShell = function (url) {
  var mongoPath = path.join(files.getDevBundle(), 'mongodb', 'bin', 'mongo');
  // XXX mongo URLs are not real URLs (notably, the comma-separation for
  // multiple hosts). We've had a little better luck using the mongodb-uri npm
  // package.
  var mongoUrl = require('url').parse(url);
  var auth = mongoUrl.auth && mongoUrl.auth.split(':');
  var ssl = require('querystring').parse(mongoUrl.query).ssl === "true";

  var args = [];
  if (ssl) args.push('--ssl');
  if (auth) args.push('-u', auth[0]);
  if (auth) args.push('-p', auth[1]);
  args.push(mongoUrl.hostname + ':' + mongoUrl.port + mongoUrl.pathname);

  var child_process = require('child_process');
  var proc = child_process.spawn(mongoPath,
                                 args,
                                 { stdio: 'inherit' });
};


// Find all running Mongo processes that were started by this program
// (even by other simultaneous runs of this program). If passed,
// appDir and port act as filters on the list of running mongos.
//
// Yields. Returns an array of objects with keys pid, port, appDir.
var findMongoPids = function (appDir, port) {
  var fut = new Future;

  // 'ps ax' should be standard across all MacOS and Linux.
  var child_process = require('child_process');
  child_process.exec(
    'ps ax',
    // we don't want this to randomly fail just because you're running lots of
    // processes. 10MB should be more than ps ax will ever spit out; the default
    // is 200K, which at least one person hit (#2158).
    {maxBuffer: 1024 * 1024 * 10},
    function (error, stdout, stderr) {
      if (error) {
        fut['throw'](new Error("Couldn't run ps ax: " + JSON.stringify(error) +
                               "; " + error.message));
        return;
      }

      var ret = [];
      _.each(stdout.split('\n'), function (line) {
        // Matches mongos we start. Note that this matches
        // 'fake-mongod' (our mongod stub for automated tests) as well
        // as 'mongod'.
        var m = line.match(/^\s*(\d+).+mongod .+--port (\d+) --dbpath (.+)(?:\/|\\)\.meteor(?:\/|\\)local(?:\/|\\)db/);
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


// Kill any mongos running on 'port'. Yields, and returns once they
// are all dead. Throws an exception on failure.
//
// This is a big hammer for dealing with still running mongos, but
// smaller hammers have failed before and it is getting tiresome.
var findMongoAndKillItDead = function (port) {
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

      utils.sleepMs(100);
    }

    // give up after 4 seconds.
    // XXX should actually catch this higher up and print a nice
    // error. foreseeable conditions should never result in exceptions
    // for the user.
    throw new Error("Can't kill running mongo (pid " + pid + ").");
  });
};

var StoppedDuringLaunch = function () {};

// Starts a single instance of mongod, and configures it properly as a singleton
// replica set. Yields.  Returns once the mongod is successfully listening (or
// the process exited).
//
// Takes an onExit handler, which will be invoked when the process exits (which
// may be before or after this function returns depending on whether or not it
// ever successfully started).
//
// If the 'multiple' option is set, it actually sets up three mongod instances
// (launching the second and third on the next two ports after the specified
// port). In this case, if any of the three instances exit for any reason, all
// are killed (and onExit is then invoked). Also, the entirety of all three
// databases is deleted before starting up.  This is mode intended for testing
// mongo failover, not for normal development or production use.
var launchMongo = function (options) {
  var onExit = options.onExit || function () {};

  var noOplog = false;
  var mongod_path = path.join(
    files.getDevBundle(), 'mongodb', 'bin', 'mongod');
  var replSetName = 'meteor';

  // Automated testing: If this is set, instead of starting mongod, we
  // start our stub (fake-mongod) which can then be remote-controlled
  // by the test.
  if (process.env.METEOR_TEST_FAKE_MONGOD_CONTROL_PORT) {
    if (options.multiple)
      throw Error("Can't specify multiple with fake mongod");

    mongod_path = path.join(files.getCurrentToolsDir(),
                            'tools', 'tests', 'fake-mongod', 'fake-mongod');

    // oplog support requires sending admin commands to mongod, so
    // it'd be hard to make fake-mongod support it.
    noOplog = true;
  }

  // add .gitignore if needed.
  files.addToGitignore(path.join(options.appDir, '.meteor'), 'local');

  var subHandles = [];
  var stopped = false;
  var stopFuture = new Future;

  // Like Future.wrap and _.bind in one.
  var yieldingMethod = function (/* object, methodName, args */) {
    var args = _.toArray(arguments);
    var object = args.shift();
    var methodName = args.shift();
    var f = new Future;
    args.push(f.resolver());
    object[methodName].apply(object, args);
    return fiberHelpers.waitForOne(stopFuture, f);
  };

  var handle = {
    stop: function () {
      if (stopped)
        return;
      stopped = true;
      _.each(subHandles, function (handle) {
        handle.stop();
      });

      stopFuture.throw(new StoppedDuringLaunch);
    }
  };

  var launchOneMongoAndWaitForReadyForInitiate = function (dbPath, port,
                                                           portFile) {
    files.mkdir_p(dbPath, 0755);

    var proc = null;
    var procExitHandler;

    findMongoAndKillItDead(port);

    if (options.multiple) {
      // This is only for testing, so we're OK with incurring the replset
      // setup on each startup.
      files.rm_recursive(dbPath);
      files.mkdir_p(dbPath, 0755);
    } else if (portFile) {
      var portFileExists = false;
      var matchingPortFileExists = false;
      try {
        matchingPortFileExists = +(fs.readFileSync(portFile)) === port;
        portFileExists = true;
      } catch (e) {
        if (!e || e.code !== 'ENOENT')
          throw e;
      }

      // If this is the first time we're using this DB, or we changed port since
      // the last time, then we want to destroy any existing replSet
      // configuration and create a new one. First we delete the "local"
      // database if it exists. (It's a pain and slow to change the port in an
      // existing replSet configuration. It's also a little slow to initiate a
      // new replSet, thus the attempt to not do it unless the port changes.)
      //
      // In the "multiple" case, we just wipe out the entire database and incur
      // the cost, because this won't affect normal users running meteor.
      if (!matchingPortFileExists) {
        // Delete the port file if it exists, so we don't mistakenly believe
        // that the DB is still configured.
        if (portFileExists)
          fs.unlinkSync(portFile);

        try {
          var dbFiles = fs.readdirSync(dbPath);
        } catch (e) {
          if (!e || e.code !== 'ENOENT')
            throw e;
        }
        _.each(dbFiles, function (dbFile) {
          if (/^local\./.test(dbFile)) {
            fs.unlinkSync(path.join(dbPath, dbFile));
          }
        });
      }
    }

    // Start mongod with a dummy replSet and wait for it to listen.
    var child_process = require('child_process');

    // Let's not actually start a process if we yielded (eg during
    // findMongoAndKillItDead) and we decided to stop in the middle (eg, because
    // we're in multiple mode and another process exited).
    if (stopped)
      return;
    proc = child_process.spawn(mongod_path, [
      // nb: cli-test.sh and findMongoPids make strong assumptions about the
      // order of the arguments! Check them before changing any arguments.
      '--bind_ip', '127.0.0.1',
      '--smallfiles',
      '--nohttpinterface',
      '--port', port,
      '--dbpath', dbPath,
      // Use an 8MB oplog rather than 256MB. Uses less space on disk and
      // initializes faster. (Not recommended for production!)
      '--oplogSize', '8',
      '--replSet', replSetName
    ]);
    subHandles.push({
      stop: function () {
        if (proc) {
          proc.removeListener('exit', procExitHandler);
          proc.kill('SIGINT');
          proc = null;
        }
      }
    });

    procExitHandler = inFiber(function (code, signal) {
      // Defang subHandle.stop().
      proc = null;

      // Kill any other processes too. This will also remove
      // procExitHandler from the other processes, so onExit will only be called
      // once.
      handle.stop();

      // Invoke the outer onExit callback.
      onExit(code, signal, stderrOutput);
    });
    proc.on('exit', procExitHandler);

    var listening = false;
    var replSetReadyToBeInitiated = false;
    var replSetReady = false;

    var readyToTalkFuture = new Future;

    var maybeReadyToTalk = function () {
      if (readyToTalkFuture.isResolved())
        return;
      if (listening && (noOplog || replSetReadyToBeInitiated || replSetReady)) {
        proc.stdout.removeListener('data', stdoutOnData);
        readyToTalkFuture.return();
      }
    };

    var stdoutOnData = inFiber(function (data) {
      // note: don't use "else ifs" in this, because 'data' can have multiple
      // lines
      if (/config from self or any seed \(EMPTYCONFIG\)/.test(data)) {
        replSetReadyToBeInitiated = true;
        maybeReadyToTalk();
      }

      if (/ \[initandlisten\] waiting for connections on port/.test(data)) {
        listening = true;
        maybeReadyToTalk();
      }

      if (/ \[rsMgr\] replSet (PRIMARY|SECONDARY)/.test(data)) {
        replSetReady = true;
        maybeReadyToTalk();
      }
    });
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', stdoutOnData);

    var stderrOutput = '';
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', function (data) {
      stderrOutput += data;
    });

    fiberHelpers.waitForOne(stopFuture, readyToTalkFuture);
  };


  var initiateReplSetAndWaitForReady = function () {
    try {
      // Load mongo-livedata so we'll be able to talk to it.
      var mongoNpmModule = unipackage.load({
        library: release.current.library,
        packages: [ 'mongo-livedata' ],
        release: release.current.name
      })['mongo-livedata'].MongoInternals.NpmModule;

      // Connect to the intended primary and start a replset.
      var db = new mongoNpmModule.Db(
        'meteor',
        new mongoNpmModule.Server('127.0.0.1', options.port, {poolSize: 1}),
        {safe: true});
      yieldingMethod(db, 'open');
      if (stopped)
        return;
      var configuration = {
        _id: replSetName,
        members: [{_id: 0, host: '127.0.0.1:' + options.port, priority: 100}]
      };
      if (options.multiple) {
        // Add two more members: one of which should start as secondary but
        // could in theory become primary, and one of which can never be
        // primary.
        configuration.members.push({
          _id: 1, host: '127.0.0.1:' + (options.port + 1), priority: 5
        });
        configuration.members.push({
          _id: 2, host: '127.0.0.1:' + (options.port + 2), priority: 0
        });
      }

      var initiateResult = yieldingMethod(
        db.admin(), 'command', {replSetInitiate: configuration});
      if (stopped)
        return;
      // why this isn't in the error is unclear.
      if (initiateResult && initiateResult.documents
          && initiateResult.documents[0]
          && initiateResult.documents[0].errmsg) {
        var err = initiateResult.documents[0].errmsg;
        if (err !== "already initialized") {
          throw Error("rs.initiate error: " +
                      initiateResult.documents[0].errmsg);
        }
      }
      // XXX timeout eventually?
      while (!stopped) {
        var status = yieldingMethod(db.admin(), 'command',
                                    {replSetGetStatus: 1});
        if (!(status && status.documents && status.documents[0]))
          throw status;
        status = status.documents[0];
        if (!status.ok) {
          if (status.startupStatus === 6) {  // "SOON"
            utils.sleepMs(20);
            continue;
          }
          throw status.errmsg;
        }
        // See http://docs.mongodb.org/manual/reference/replica-states/
        // for information about the various states.

        // Are any of the members starting up or recovering?
        if (_.any(status.members, function (member) {
          return member.stateStr === 'STARTUP' ||
            member.stateStr === 'STARTUP2' ||
            member.stateStr === 'RECOVERING';
        })) {
          utils.sleepMs(20);
          continue;
        }

        // Is the intended primary currently a secondary? (It passes through
        // that phase briefly.)

        if (status.members[0].stateStr === 'SECONDARY') {
          utils.sleepMs(20);
          continue;
        }

        // Anything else for the intended primary is probably an error.
        if (status.members[0].stateStr !== 'PRIMARY') {
          throw Error("Unexpected Mongo status: " + JSON.stringify(status));
        }

        // Anything but secondary for the other members is probably an error.
        for (var i = 1; i < status.members.length; ++i) {
          if (status.members[i].stateStr !== 'SECONDARY') {
            throw Error("Unexpected Mongo secondary status: " +
                        JSON.stringify(status));
          }
        }

        break;
      }

      db.close(true /* means "the app is closing the connection" */);
    } catch (e) {
      // If the process has exited, we're doing another form of error
      // handling. No need to throw random low-level errors farther.
      if (!stopped || (e instanceof StoppedDuringLaunch))
        throw e;
    }
  };

  try {
    if (options.multiple) {
      var dbBasePath = path.join(options.appDir, '.meteor', 'local', 'dbs');
      _.each(_.range(3), function (i) {
        // Did we get stopped (eg, by one of the processes exiting) by now? Then
        // don't start anything new.
        if (stopped)
          return;
        var dbPath = path.join(options.appDir, '.meteor', 'local', 'dbs', ''+i);
        launchOneMongoAndWaitForReadyForInitiate(dbPath, options.port + i);
      });
      if (!stopped) {
        initiateReplSetAndWaitForReady();
      }
    } else {
      var dbPath = path.join(options.appDir, '.meteor', 'local', 'db');
      var portFile = !noOplog && path.join(dbPath, 'METEOR-PORT');
      launchOneMongoAndWaitForReadyForInitiate(dbPath, options.port, portFile);
      if (!stopped && !noOplog) {
        initiateReplSetAndWaitForReady();
        if (!stopped) {
          // Write down that we configured the database properly.
          fs.writeFileSync(portFile, options.port);
        }
      }
    }
  } catch (e) {
    if (!(e instanceof StoppedDuringLaunch))
      throw e;
  }

  if (stopped)
    return null;

  return handle;
};

// This runs a Mongo process and restarts it whenever it fails. If it
// restarts too often, we give up on restarting it, diagnostics are
// logged, and onFailure is called.
//
// options: appDir, port, onFailure, multiple
var MongoRunner = function (options) {
  var self = this;
  self.appDir = options.appDir;
  self.port = options.port;
  self.onFailure = options.onFailure;
  self.multiple = options.multiple;

  self.handle = null;
  self.shuttingDown = false;
  self.startupFuture = null;

  self.errorCount = 0;
  self.errorTimer = null;
  self.restartTimer = null;
};

_.extend(MongoRunner.prototype, {
  // Blocks (yields) until the server has started for the first time
  // and is accepting connections. (It might subsequently die and be
  // restarted; we won't tell you about that.) Returns true if we were
  // able to get it to start at least once.
  //
  // If the server fails to start for the first time (after a few
  // restarts), we'll print a message and give up, returning false.
  start: function () {
    var self = this;

    if (self.handle)
      throw new Error("already running?");

    self._startOrRestart();

    // Did we properly start up? Great!
    if (self.handle)
      return;

    // Are we shutting down? OK.
    if (self.shuttingDown)
      return;

    // Otherwise, wait for a successful _startOrRestart, or a failure.
    if (!self.startupFuture) {
      self.startupFuture = new Future;
      self.startupFuture.wait();
    }
  },

  // Tries to launch Mongo once.  It returns when either (a) Mongo is listening
  // or (b) mongod exited before it got to the point of listening.
  //
  // (To be specific: in non-multiple mode, this means that the single mongod is
  // listening and the primary, or that the single mongod died. In multiple
  // mode, it means that the first mongod is listening and is primary and the
  // other mongods are listening and are secondary, or that any mongod died (and
  // it tried to kill the others).)
  //
  // In case (a), self.handle will be the handle returned from launchMongo; in
  // case (b) self.handle will be null.
  _startOrRestart: function () {
    var self = this;

    if (self.handle)
      throw new Error("already running?");

    self.handle = launchMongo({
      appDir: self.appDir,
      port: self.port,
      multiple: self.multiple,
      onExit: _.bind(self._exited, self)
    });
    if (self.handle) {
      self._allowStartupToReturn();
    }
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
    runLog.log(
      stderr.split('\n').slice(-20).join('\n') +
      "Unexpected mongo exit code " + code +
        (self.multiple ? "." : ". Restarting."));

    // If we're in multiple mode, we never try to restart. That's to keep the
    // test-only multiple code simple.
    if (self.multiple) {
      self._fail();
      return;
    }

    // We'll restart it up to 3 times in a row. The counter is reset
    // when 5 seconds goes without a restart. (Note that by using a
    // timer instead of looking at the current date, we avoid getting
    // confused by time changes.)
    self.errorCount ++;
    if (self.errorTimer)
      clearTimeout(self.errorTimer);
    self.errorTimer = setTimeout(function () {
      self.errorTimer = null;
      self.errorCount = 0;
    }, 5000);

    if (self.errorCount < 3) {
      // Wait a second, then restart.
      self.restartTimer = setTimeout(inFiber(function () {
        self.restartTimer = null;
        self._startOrRestart();
      }), 1000);
      return;
    }

    // Too many restarts, too quicky. It's dead. Print friendly
    // diagnostics and give up.
    var explanation = mongoExitCodes.Codes[code];
    var message = "Can't start Mongo server.";

    if (explanation)
      message += "\n" + explanation.longText;

    if (explanation === mongoExitCodes.EXIT_NET_ERROR) {
      message += "\n\n" +
"Check for other processes listening on port " + self.port + "\n" +
"or other Meteor instances running in the same project.";
    }

    if (! explanation && /GLIBC/i.test(stderr)) {
      message += "\n\n" +
"Looks like you are trying to run Meteor on an old Linux distribution.\n" +
"Meteor on Linux requires glibc version 2.9 or above. Try upgrading your\n" +
"distribution to the latest version.";
    }

    runLog.log(message);
    self._fail();
  },

  // Idempotent
  stop: function () {
    var self = this;

    if (self.shuttingDown)
      return;

    self.shuttingDown = true;

    self.errorTimer && clearTimeout(self.errorTimer);
    self.restartTimer && clearTimeout(self.restartTimer);

    if (self.handle) {
      self.handle.stop();
      self.handle = null;
    }
  },

  _allowStartupToReturn: function () {
    var self = this;
    if (self.startupFuture) {
      var startupFuture = self.startupFuture;
      self.startupFuture = null;
      startupFuture.return();
    }
  },

  _fail: function () {
    var self = this;
    self.stop();
    self.onFailure && self.onFailure();
    self._allowStartupToReturn();
  },

  _mongoHosts: function () {
    var self = this;
    var ports = [self.port];
    if (self.multiple) {
      ports.push(self.port + 1, self.port + 2);
    }
    return _.map(ports, function (port) {
      return "127.0.0.1:" + port;
    }).join(",");
  },

  mongoUrl: function () {
    var self = this;
    return "mongodb://" + self._mongoHosts() + "/meteor";
  },

  oplogUrl: function () {
    var self = this;
    return "mongodb://" + self._mongoHosts() + "/local";
  }
});


exports.runMongoShell = runMongoShell;
exports.findMongoPort = findMongoPort;
exports.MongoRunner = MongoRunner;
