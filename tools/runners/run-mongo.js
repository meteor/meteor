var files = require('../fs/files.js');
var utils = require('../utils/utils.js');
var mongoExitCodes = require('../utils/mongo-exit-codes.js');
var fiberHelpers = require('../utils/fiber-helpers.js');
var runLog = require('./run-log.js');
var child_process = require('child_process');

var _ = require('underscore');
import { loadIsopackage } from '../tool-env/isopackets.js';
var Console = require('../console/console.js').Console;

// Given a Mongo URL, open an interative Mongo shell on this terminal
// on that database.
var runMongoShell = function (url) {
  var mongoPath = files.pathJoin(
    files.getDevBundle(), 'mongodb', 'bin', 'mongo'
  );
  // XXX mongo URLs are not real URLs (notably, the comma-separation for
  // multiple hosts). We've had a little better luck using the mongodb-uri npm
  // package.
  var mongoUrl = require('url').parse(url);
  var auth = mongoUrl.auth && mongoUrl.auth.split(':');
  var ssl = require('querystring').parse(mongoUrl.query).ssl === "true";

  var args = [];
  if (ssl) {
    args.push('--ssl');
  }
  if (auth) {
    args.push('-u', auth[0]);
  }
  if (auth) {
    args.push('-p', auth[1]);
  }
  args.push(mongoUrl.hostname + ':' + mongoUrl.port + mongoUrl.pathname);

  child_process.spawn(files.convertToOSPath(mongoPath),
    args, { stdio: 'inherit' });
};

// Start mongod with a dummy replSet and wait for it to listen.
function spawnMongod(mongodPath, port, dbPath, replSetName) {
  const child_process = require('child_process');

  mongodPath = files.convertToOSPath(mongodPath);
  dbPath = files.convertToOSPath(dbPath);

  const args = [
    // nb: cli-test.sh and findMongoPids make strong assumptions about the
    // order of the arguments! Check them before changing any arguments.
    '--bind_ip', (process.env.METEOR_MONGO_BIND_IP || '127.0.0.1'),
    '--port', port,
    '--dbpath', dbPath,
    // Use an 8MB oplog rather than 256MB. Uses less space on disk and
    // initializes faster. (Not recommended for production!)
    '--oplogSize', '8',
    '--replSet', replSetName,
    '--noauth'
  ];

  // Use mmapv1 on 32bit platforms, as our binary doesn't support WT
  if (process.arch === 'ia32') {
    args.push('--storageEngine', 'mmapv1', '--smallfiles');
  } else if (process.platform !== 'linux') {
    // MongoDB 4, which we use on 64-bit systems, displays a banner in the
    // Mongo shell about a free monitoring service, which can be disabled
    // with this flag. However, the generic Linux build (without SSL; see
    // MONGO_SSL in scripts/generate-dev-bundle.sh) neither displays the
    // banner nor supports the flag, so it's safe/important to avoid
    // passing the flag to mongod on 64-bit linux.
    args.push('--enableFreeMonitoring', 'off');
  }

  return child_process.spawn(mongodPath, args, {
    // Apparently in some contexts, Mongo crashes if your locale isn't set up
    // right. I wasn't able to reproduce it, but many people on #4019
    // were. Let's default a couple environment variables to English UTF-8 if
    // they aren't set already. If these few aren't good enough, we'll at least
    // detect the locale error and print a link to #4019 (look for
    // `detectedErrors.badLocale` below).
    env: _.extend({
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8'
    }, process.env)
  });
}

// Find all running Mongo processes that were started by this program
// (even by other simultaneous runs of this program). If passed,
// dbDir and port act as filters on the list of running mongos.
//
// Yields. Returns an array of objects with keys pid, port, dbDir.
var findMongoPids;
if (process.platform === 'win32') {
  // Windows doesn't have a ps equivalent that (reliably) includes the command
  // line, so approximate using the combined output of tasklist and netstat.
  findMongoPids = function (dbDir_unused, port) {
    var promise = fiberHelpers.makeFulfillablePromise();

    child_process.exec('tasklist /fi "IMAGENAME eq mongod.exe"',
      function (error, stdout, stderr) {
        if (error) {
          var additionalInfo = JSON.stringify(error);
          if (error.code === 'ENOENT') {
            additionalInfo = "tasklist wasn't found on your system, it usually can be found at C:\\Windows\\System32\\.";
          }
          promise.reject(
            new Error("Couldn't run tasklist.exe: " + additionalInfo)
          );
          return;
        } else {
          // Find the pids of all mongod processes
          var mongo_pids = [];
          _.each(stdout.split('\n'), function (line) {
            var m = line.match(/^mongod.exe\s+(\d+) /);
            if (m) {
              mongo_pids[m[1]] = true;
            }
          });

          // Now get the corresponding port numbers
          child_process.exec(
            'netstat -ano',
            {maxBuffer: 1024 * 1024 * 10},
            function (error, stdout, stderr) {
            if (error) {
              promise.reject(
                new Error("Couldn't run netstat -ano: " +
                          JSON.stringify(error))
              );
              return;
            } else {
              var pids = [];
              _.each(stdout.split('\n'), function (line) {
                var m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
                if (m) {
                  var found_pid =  parseInt(m[2], 10);
                  var found_port = parseInt(m[1], 10);

                  // We can't check the path app_dir so assume it always matches
                  if (mongo_pids[found_pid] && (!port || port === found_port)) {
                    // Note that if the mongo rest interface is enabled the
                    // initial port + 1000 is also likely to be open.
                    // So remove the pid so we only match it once.
                    delete mongo_pids[found_pid];
                    pids.push({
                      pid: found_pid,
                      port: found_port,
                      app_dir: null});
                  }
                }
              });

              promise.resolve(pids);
            }
          });
        }
      });

    return promise.await();
  };
} else {
  findMongoPids = function (dbDir, port) {
    var promise = fiberHelpers.makeFulfillablePromise();

    // 'ps ax' should be standard across all MacOS and Linux.
    // However, ps on OS X corrupts some non-ASCII characters in arguments,
    // such as т (CYRILLIC SMALL LETTER TE), leading to this function
    // failing to properly match pathnames with those characters.  #3999
    //
    // pgrep appears to do a better job (and has output that is roughly
    // similar; it lacks a few fields that we don't care about).  Plus,
    // it can do some of the grepping for us.
    //
    // However, 'pgrep' only started shipping with OS X 10.8 (and may be less
    // common on Linux too), so we check to see if it exists and fall back to
    // 'ps' if we can't find it.
    //
    // We avoid using pgrep on Linux, because some versions of Linux pgrep
    // require you to pass -a/--list-full to include the arguments in the
    // output, and other versions fail if you pass that option. We have not
    // observed the Unicode corruption on Linux, so using ps ax there is fine.
    var psScript = 'ps ax';
    if (process.platform === 'darwin') {
      psScript =
        'if type pgrep >/dev/null 2>&1; then ' +
        // -lf means to display and match against full argument lists.
        // pgrep exits 1 if no processes match the argument; we're OK
        // considering this as a success, but we don't want other errors
        // to be ignored.  Note that this is sh not bash, so we can't use
        // [[.
        'pgrep -lf mongod; test "$?" -eq 0 -o "$?" -eq 1;' +
        'else ps ax; fi';
    }

    // If the child process output includes unicode, make sure it's
    // handled properly.
    const {
      LANG = "en_US.UTF-8",
      LC_ALL = LANG,
      LANGUAGE = LANG,
      // Remainder of process.env without above properties.
      ...env
    } = process.env;

    // Make sure all three properties are set to the same value, which
    // defaults to "en_US.UTF-8" or whatever LANG was already set to.
    Object.assign(env, { LANG, LC_ALL, LANGUAGE });

    child_process.exec(
      psScript,
      {
        env,
        // we don't want this to randomly fail just because you're running
        // lots of processes. 10MB should be more than ps ax will ever
        // spit out; the default is 200K, which at least one person hit
        // (#2158).
        maxBuffer: 1024 * 1024 * 10,
      },
      function (error, stdout, stderr) {
        if (error) {
          promise.reject(
            new Error("Couldn't run ps ax: " +
                      JSON.stringify(error) + "; " +
                      error.message)
          );
          return;
        }

        var ret = [];
        _.each(stdout.split('\n'), function (line) {
          // Matches mongos we start. Note that this matches
          // 'fake-mongod' (our mongod stub for automated tests) as well
          // as 'mongod'.
          var m = line.match(/^\s*(\d+).+mongod .+--port (\d+) --dbpath (.+(?:\/|\\)db)/);
          if (m && m.length === 4) {
            var foundPid =  parseInt(m[1], 10);
            var foundPort = parseInt(m[2], 10);
            var foundPath = m[3];

            if ( (! port || port === foundPort) &&
                 (! dbDir || dbDir === foundPath)) {
              ret.push({
                pid: foundPid,
                port: foundPort,
                dbDir: foundPath
              });
            }
          }
        });

        promise.resolve(ret);
      });

    return promise.await();
  };
}

// See if mongo is running already. Yields. Returns the port that
// mongo is running on or null if mongo is not running.
var findMongoPort = function (dbDir) {
  var pids = findMongoPids(dbDir);

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

// XXX actually -- the code below is probably more correct than the code we
// have above for non-Windows platforms (since that code relies on
// `findMongoPids`). But changing this a few days before the 1.1 release
// seemed too bold. But if you're changing code around here, consider using
// the implementation below on non-Windows platforms as well.
if (process.platform === 'win32') {
  // On Windows, finding the Mongo pid, checking it and extracting the port
  // is often unreliable (XXX reliable in what specific way?). There is an
  // easier way to find the port of running Mongo: look it up in a METEOR-
  // PORT file that we generate when running. This may result into problems
  // where we try to connect to a mongod that is not running, or a wrong
  // mongod if our current app is not running but there is a left-over file
  // lying around. This still can be better than always failing to connect.
  findMongoPort = function (dbPath) {
    var mongoPort = null;

    var portFile = files.pathJoin(dbPath, 'METEOR-PORT');
    if (files.exists(portFile)) {
      mongoPort = files.readFile(portFile, 'utf8').replace(/\s/g, '');
    }

    // Now, check if there really is a Mongo server running on this port.
    // (The METEOR-PORT file may point to an old Mongo server that's now
    // stopped)
    var net = require('net');

    return new Promise(resolve => {
      var client = net.connect({
        port: mongoPort
      }, () => {
        // The server is running.
        client.end();
        resolve(mongoPort);
      });
      client.on('error', () => resolve(null));
    }).catch(() => null).await();
  }
}


// Kill any mongos running on 'port'. Yields, and returns once they
// are all dead. Throws an exception on failure.
//
// This is a big hammer for dealing with still running mongos, but
// smaller hammers have failed before and it is getting tiresome.
var findMongoAndKillItDead = function (port, dbPath) {
  var pids = findMongoPids(null, port);

  // Go through the list serially. There really should only ever be
  // at most one but we're not taking any chances.
  _.each(pids, function (processInfo) {
    var pid = processInfo.pid;

    // Send kill attempts and wait. First a SIGINT, then if it isn't
    // dead within 2 sec, SIGKILL. Check every 100ms to see if it's
    // dead.
    for (var attempts = 1; attempts <= 40; attempts ++) {
      var signal = 0;
      if (attempts === 1) {
        signal = 'SIGINT';
      } else if (attempts === 20 || attempts === 30) {
        signal = 'SIGKILL';
      }

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

  // If we had to kill mongod with SIGKILL, or on Windows where all calls to
  // `process.kill` work like SIGKILL, mongod will not have the opportunity to
  // close gracefully. Delete a lock file that may have been left over.
  var mongodLockFile = files.pathJoin(dbPath, "mongod.lock");
  if (files.exists(mongodLockFile)) {
    files.unlink(mongodLockFile)
  }
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
  var mongod_path = files.pathJoin(
    files.getDevBundle(), 'mongodb', 'bin', 'mongod'
  );
  var replSetName = 'meteor';

  // Automated testing: If this is set, instead of starting mongod, we
  // start our stub (fake-mongod) which can then be remote-controlled
  // by the test.
  if (process.env.METEOR_TEST_FAKE_MONGOD_CONTROL_PORT) {
    if (options.multiple) {
      throw Error("Can't specify multiple with fake mongod");
    }

    var fakeMongodCommand =
      process.platform === "win32" ? "fake-mongod.bat" : "fake-mongod";
    mongod_path = files.pathJoin(
      files.getCurrentToolsDir(), 'tools',
      'tests', 'fake-mongod', fakeMongodCommand);

    // oplog support requires sending admin commands to mongod, so
    // it'd be hard to make fake-mongod support it.
    noOplog = true;
  }

  var subHandles = [];
  var stopped = false;
  var handle = {};
  var stopPromise = new Promise((resolve, reject) => {
    handle.stop = function () {
      if (stopped) {
        return;
      }
      stopped = true;
      _.each(subHandles, function (handle) {
        handle.stop();
      });

      if (options.onStopped) {
        options.onStopped();
      }

      reject(new StoppedDuringLaunch);
    };
  });

  var yieldingMethod = function (object, methodName, ...args) {
    return Promise.race([
      stopPromise,
      new Promise((resolve, reject) => {
        object[methodName](...args, (err, res) => {
          err ? reject(err) : resolve(res);
        });
      })
    ]).await();
  };

  var launchOneMongoAndWaitForReadyForInitiate = function (dbPath, port,
                                                           portFile) {
    files.mkdir_p(dbPath, 0o755);

    var proc = null;

    if (options.allowKilling) {
      findMongoAndKillItDead(port, dbPath);
    }

    if (options.multiple) {
      // This is only for testing, so we're OK with incurring the replset
      // setup on each startup.
      files.rm_recursive(dbPath);
      files.mkdir_p(dbPath, 0o755);
    } else if (portFile) {
      var portFileExists = false;
      var matchingPortFileExists = false;
      try {
        matchingPortFileExists = +(files.readFile(portFile)) === port;
        portFileExists = true;
      } catch (e) {
        if (!e || e.code !== 'ENOENT') {
          throw e;
        }
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
        if (portFileExists) {
          files.unlink(portFile);
        }

        try {
          var dbFiles = files.readdir(dbPath);
        } catch (e) {
          if (!e || e.code !== 'ENOENT') {
            throw e;
          }
        }
        _.each(dbFiles, function (dbFile) {
          if (/^local\./.test(dbFile)) {
            files.unlink(files.pathJoin(dbPath, dbFile));
          }
        });
      }
    }

    // Let's not actually start a process if we yielded (eg during
    // findMongoAndKillItDead) and we decided to stop in the middle (eg, because
    // we're in multiple mode and another process exited).
    if (stopped) {
      return;
    }

    proc = spawnMongod(mongod_path, port, dbPath, replSetName);

    function stop() {
      if (proc) {
        proc.removeListener('exit', procExitHandler);
        proc.kill('SIGINT');
        proc = null;
      }
    }
    require("../tool-env/cleanup.js").onExit(stop);
    subHandles.push({ stop });

    var procExitHandler = fiberHelpers.bindEnvironment(function (code, signal) {
      // Defang subHandle.stop().
      proc = null;

      // Kill any other processes too. This will also remove
      // procExitHandler from the other processes, so onExit will only be called
      // once.
      handle.stop();

      // Invoke the outer onExit callback.
      onExit(code, signal, stderrOutput, detectedErrors);
    });
    proc.on('exit', procExitHandler);

    var listening = false;
    var replSetReadyToBeInitiated = false;
    var replSetReady = false;

    var maybeReadyToTalk;
    var readyToTalkPromise = new Promise(function (resolve) {
      maybeReadyToTalk = function () {
        if (resolve &&
            listening &&
            (noOplog || replSetReadyToBeInitiated || replSetReady)) {
          proc.stdout.removeListener('data', stdoutOnData);
          resolve();
          resolve = null;
        }
      };
    });

    var stopOrReadyPromise = Promise.race([
      stopPromise,
      readyToTalkPromise,
    ]);

    var detectedErrors = {};
    var stdoutOnData = fiberHelpers.bindEnvironment(function (data) {
      // note: don't use "else ifs" in this, because 'data' can have multiple
      // lines
      if (/\[initandlisten\] Did not find local replica set configuration document at startup/.test(data) ||
          /\[.*\] Locally stored replica set configuration does not have a valid entry for the current node/.test(data)) {
        replSetReadyToBeInitiated = true;
        maybeReadyToTalk();
      }

      if (/ \[.*\] waiting for connections on port/.test(data)) {
        listening = true;
        maybeReadyToTalk();
      }

      if (/ \[rsSync-0\] transition to primary complete/.test(data)) {
        replSetReady = true;
        maybeReadyToTalk();
      }

      if (/Insufficient free space/.test(data)) {
        detectedErrors.freeSpace = true;
      }

      // Running against a old mmapv1 engine, probably from pre-mongo-3.2 Meteor
      if (/created by the 'mmapv1' storage engine, so setting the active storage engine to 'mmapv1'/.test(data)) {
        Console.warn();
        Console.warn('Your development database is using mmapv1, '
          + 'the old, pre-MongoDB 3.0 database engine. '
          + 'You should consider upgrading to Wired Tiger, the new engine. '
          + 'The easiest way to do so in development is to run '
          + Console.command('meteor reset') + '. '
          + "If you'd like to migrate your database, please consult "
          + Console.url('https://docs.mongodb.org/v3.0/release-notes/3.0-upgrade/'))
        Console.warn();
      }

      if (/Invalid or no user locale set/.test(data)) {
        detectedErrors.badLocale = true;
      }
    });
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', stdoutOnData);

    var stderrOutput = '';
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', function (data) {
      stderrOutput += data;
    });

    stopOrReadyPromise.await();
  };


  var initiateReplSetAndWaitForReady = function () {
    try {
      // Load mongo so we'll be able to talk to it.
      const {
        MongoClient,
        Server
      } = loadIsopackage('npm-mongo').NpmModuleMongodb;

      // Connect to the intended primary and start a replset.
      const client = new MongoClient(
        new Server('127.0.0.1', options.port, {
          poolSize: 1,
          socketOptions: {
            connectTimeoutMS: 60000
          }
        })
      );

      yieldingMethod(client, 'connect');
      const db = client.db('meteor');

      if (stopped) {
        return;
      }

      var configuration = {
        _id: replSetName,
        version: 1,
        protocolVersion: 1,
        members: [{_id: 0, host: '127.0.0.1:' + options.port, priority: 100}]
      };

      try {
        const config = yieldingMethod(db.admin(), "command", {
          replSetGetConfig: 1,
        }).config;

        // If a replication set configuration already exists, it's
        // important that the new version number is greater than the old.
        if (config && _.has(config, "version")) {
          configuration.version = config.version + 1;
        }
      } catch (e) {}

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

      try {
        yieldingMethod(db.admin(), 'command', {
          replSetInitiate: configuration,
        });
      } catch (e) {
        if (e.message === 'already initialized') {
          yieldingMethod(db.admin(), 'command', {
            replSetReconfig: configuration,
            force: true,
          });
        } else {
          throw Error("rs.initiate error: " + e.message);
        }
      }

      if (stopped) {
        return;
      }

      let writableTimestamp = Date.now();

      // Wait until the primary is writable. If it isn't writable after one
      // minute, throw an error and report the replica set status.
      while (!stopped) {
        const { ismaster } = yieldingMethod(db.admin(), "command", {
          isMaster: 1
        });

        if (ismaster) {
          break;
        } else if (Date.now() - writableTimestamp > 60000) {
          const status = yieldingMethod(db.admin(), "command", {
            replSetGetStatus: 1
          });

          throw new Error(
            "Primary not writable after one minute. Last replica set status: " +
             JSON.stringify(status)
          );
        }

        utils.sleepMs(50);
      }

      client.close(true /* means "the app is closing the connection" */);
    } catch (e) {
      // If the process has exited, we're doing another form of error
      // handling. No need to throw random low-level errors farther.
      if (!stopped || (e instanceof StoppedDuringLaunch)) {
        throw e;
      }
    }
  };

  try {
    if (options.multiple) {
      var dbBasePath = files.pathJoin(options.projectLocalDir, 'dbs');
      _.each(_.range(3), function (i) {
        // Did we get stopped (eg, by one of the processes exiting) by now? Then
        // don't start anything new.
        if (stopped) {
          return;
        }
        var dbPath = files.pathJoin(options.projectLocalDir, 'dbs', ''+i);
        launchOneMongoAndWaitForReadyForInitiate(dbPath, options.port + i);
      });
      if (!stopped) {
        initiateReplSetAndWaitForReady();
      }
    } else {
      var dbPath = files.pathJoin(options.projectLocalDir, 'db');
      var portFile = !noOplog && files.pathJoin(dbPath, 'METEOR-PORT');
      launchOneMongoAndWaitForReadyForInitiate(dbPath, options.port, portFile);
      if (!stopped && !noOplog) {
        initiateReplSetAndWaitForReady();
        if (!stopped) {
          // Write down that we configured the database properly.
          files.writeFile(portFile, options.port);
        }
      }
    }
  } catch (e) {
    if (!(e instanceof StoppedDuringLaunch)) {
      throw e;
    }
  }

  if (stopped) {
    return null;
  }

  return handle;
};

// This runs a Mongo process and restarts it whenever it fails. If it
// restarts too often, we give up on restarting it, diagnostics are
// logged, and onFailure is called.
//
// options: projectLocalDir, port, onFailure, multiple
var MongoRunner = function (options) {
  var self = this;
  self.projectLocalDir = options.projectLocalDir;
  self.port = options.port;
  self.onFailure = options.onFailure;
  self.multiple = options.multiple;

  self.handle = null;
  self.shuttingDown = false;
  self.resolveStartupPromise = null;

  self.errorCount = 0;
  self.errorTimer = null;
  self.restartTimer = null;
  self.firstStart = true;
  self.suppressExitMessage = false;
};

var MRp = MongoRunner.prototype;

_.extend(MRp, {
  // Blocks (yields) until the server has started for the first time and
  // is accepting connections. (It might subsequently die and be
  // restarted; we won't tell you about that.)
  //
  // If the server fails to start for the first time (after a few
  // restarts), we'll print a message and give up.
  start: function () {
    var self = this;

    if (self.handle) {
      throw new Error("already running?");
    }

    self._startOrRestart();

    // Did we properly start up? Great!
    if (self.handle) {
      return;
    }

    // Are we shutting down? OK.
    if (self.shuttingDown) {
      return;
    }

    // Otherwise, wait for a successful _startOrRestart, or a failure.
    if (! self.resolveStartupPromise) {
      new Promise(function (resolve) {
        self.resolveStartupPromise = resolve;
      }).await();
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

    if (self.handle) {
      throw new Error("already running?");
    }

    var allowKilling = self.multiple || self.firstStart;
    self.firstStart = false;
    if (! allowKilling) {
      // If we're not going to try to kill an existing mongod first, then we
      // shouldn't annoy the user by telling it that we couldn't start up.
      self.suppressExitMessage = true;
    }

    self.handle = launchMongo({
      projectLocalDir: self.projectLocalDir,
      port: self.port,
      multiple: self.multiple,
      allowKilling: allowKilling,
      onExit: _.bind(self._exited, self),
      onStopped() {
        self.suppressExitMessage = false;
      },
    });
    // It has successfully started up, so if it exits after this point, that
    // actually is an interesting fact and we shouldn't suppress it.
    self.suppressExitMessage = false;

    if (self.handle) {
      self._allowStartupToReturn();
    }
  },

  _exited: function (code, signal, stderr, detectedErrors) {
    var self = this;

    self.handle = null;

    // If Mongo exited because (or rather, anytime after) we told it
    // to exit, great, nothing to do. Otherwise, we'll print an error
    // and try to restart.
    if (self.shuttingDown) {
      return;
    }

    // Only print an error if we tried to kill Mongo and something went
    // wrong. If we didn't try to kill Mongo, we'll do that on the next
    // restart. Not killing it on the first try is important for speed,
    // since findMongoAndKillItDead is a very slow operation.
    if (! self.suppressExitMessage) {
      // Print the last 20 lines of stderr.
      runLog.log(
        stderr.split('\n').slice(-20).join('\n') +
          "Unexpected mongo exit code " + code +
          (self.multiple ? "." : ". Restarting."));
    }

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
    if (self.errorTimer) {
      clearTimeout(self.errorTimer);
    }
    self.errorTimer = setTimeout(function () {
      self.errorTimer = null;
      self.errorCount = 0;
    }, 5000);

    if (self.errorCount < 3) {
      // Wait a second, then restart.
      self.restartTimer = setTimeout(fiberHelpers.bindEnvironment(function () {
        self.restartTimer = null;
        self._startOrRestart();
      }), 1000);
      return;
    }

    // Too many restarts, too quicky. It's dead. Print friendly
    // diagnostics and give up.
    var explanation = mongoExitCodes.Codes[code];
    var message = "Can't start Mongo server.";

    if (explanation && explanation.symbol === 'EXIT_UNCAUGHT' &&
        detectedErrors.freeSpace) {
      message += "\n\n" +
        "Looks like you are out of free disk space under .meteor/local.";
    } else if (explanation) {
      message += "\n" + explanation.longText;
    }

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

    if (detectedErrors.badLocale) {
      message += "\n\n" +
"Looks like MongoDB doesn't understand your locale settings. See\n" +
"https://github.com/meteor/meteor/issues/4019 for more details.";
    }

    runLog.log(message);
    self._fail();
  },

  // Idempotent
  stop: function () {
    var self = this;

    if (self.shuttingDown) {
      return;
    }

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
    if (self.resolveStartupPromise) {
      var resolve = self.resolveStartupPromise;
      self.resolveStartupPromise = null;
      resolve();
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
exports.findMongoAndKillItDead = findMongoAndKillItDead;
