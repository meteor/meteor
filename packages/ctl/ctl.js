var optimist = Npm.require('optimist');
var Future = Npm.require('fibers/future');

var Commands = [];

var findCommand = function (name) {
  var cmd = _.where(Commands, { name: name })[0];
  if (! cmd) {
    console.log("'" + name + "' is not a ctl command. See 'ctl --help'.");
    process.exit(1);
  }

  return cmd;
};

var findGalaxy = _.once(function () {
  if (!('GALAXY' in process.env)) {
    console.log(
      "GALAXY environment variable must be set. See 'galaxy --help'.");
    process.exit(1);
  }

  return Meteor.connect(process.env['GALAXY']);
});

var jobsCollection = _.once(function () {
  return new Meteor.Collection("jobs", {manager: findGalaxy()});
});

// use _.memoize so that this is called only once per app.
var subscribeToAppJobs = _.memoize(function (appName) {
  var f = new Future();
  findGalaxy().subscribe("jobsByApp", appName, {
    onReady: function () {f.return();},
    onError: function (e) {f.throw(e);}
  });
  f.wait();
});

// XXX this never unsubs...
var getJobsByApp = function (appName, restOfSelector) {
  var galaxy = findGalaxy();
  subscribeToAppJobs(appName);
  var selector = {app: appName};
  if (restOfSelector)
    _.extend(selector, restOfSelector);
  return jobsCollection().find(selector);
};

var myAppName = _.once(function () {
  if (!('GALAXY_APP' in process.env)) {
    console.log("GALAXY_APP environment variable must be set.");
    process.exit(1);
  }
  return process.env.GALAXY_APP;
});

var myJobId = _.once(function () {
  if (!('GALAXY_JOB' in process.env)) {
    console.log("GALAXY_JOB environment variable must be set.");
    process.exit(1);
  }
  return process.env.GALAXY_JOB;
});

var usage = function() {
  process.stdout.write(
"Usage: ctl [--help] <command> [<args>]\n" +
"\n" +
"For now, the GALAXY environment variable must be set to the location of\n" +
"your Galaxy management server (Ultraworld.) This string is in the same\n" +
"format as the argument to Meteor.connect().\n" +
"\n" +
"Commands:\n");
  _.each(Commands, function (cmd) {
    if (cmd.help && ! cmd.hidden) {
      var name = cmd.name + "                ".substr(cmd.name.length);
      process.stdout.write("   " + name + cmd.help + "\n");
    }
  });
  process.stdout.write("\n");
  process.stdout.write(
    "See 'ctl help <command>' for details on a command.\n");
  process.exit(1);
};


// XXX copied to meteor/tools/deploy-galaxy.js
var exitWithError = function (error, messages) {
  messages = messages || {};

  if (! (error instanceof Meteor.Error))
    throw error; // get a stack

  var msg = messages[error.error];
  if (msg)
    process.stderr.write(msg + "\n");
  else if (error instanceof Meteor.Error)
    process.stderr.write("Denied: " + error.message + "\n");

  process.exit(1);
};


// XXX copied to meteor/tools/deploy-galaxy.js
var prettyCall = function (galaxy, name, args, messages) {
  try {
    var ret = galaxy.apply(name, args);
  } catch (e) {
    exitWithError(e, messages);
  }
  return ret;
};


Commands.push({
  name: "help",
  func: function (argv) {
    if (!argv._.length || argv.help)
      usage();
    var cmd = argv._.splice(0,1)[0];
    argv.help = true;

    findCommand(cmd).func(argv);
  }
});


Commands.push({
  name: "start",
  help: "Start this app",
  func: function (argv) {
    if (argv.help || argv._.length !== 0) {
      process.stderr.write(
"Usage: ctl start\n" +
 "\n" +
"Starts the app. For now, this just means that it runs the 'server'\n" +
"program.\n"
);
      process.exit(1);
    }

    var numServers = getJobsByApp(
      myAppName(), {program: 'server', done: false}).count();
    if (numServers === 0) {
      var appConfig = prettyCall(
        findGalaxy(), 'getAppConfiguration', [myAppName()]);

      var deployConfig = {
        boot: {
          bind: {
            localPort: 0,
            // XXX hardcode proxy location
            viaProxy: {
              proxyEndpoint: "localhost:3500",
              bindHost: appConfig.sitename,
              // XXX eventually proxy should be privileged
              unprivilegedPorts: true
            }
          }
        },
        packages: {
          "mongo-livedata": {
            url: appConfig.MONGO_URL
          }
        }
      };

      // XXX args? env?
      prettyCall(findGalaxy(), 'run', [myAppName(), 'server', {
        exitPolicy: 'restart',
        env: {
          METEOR_DEPLOY_CONFIG: JSON.stringify(deployConfig)
        },
        ports: {
          "main": {
            bindEnv: "PORT",
            routeEnv: "ROUTE"
          }
        }
      }]);
      console.log("Started a server.");
    } else {
      console.log("Server already running.");
    }
  }
});


var kill = function (programName, jobId) {
  console.log("Killing %s (%s)", programName, jobId);
  prettyCall(findGalaxy(), 'kill', [jobId]);
};

Commands.push({
  name: "stop",
  help: "Stop this app",
  func: function (argv) {
    if (argv.help || argv._.length !== 0) {
      process.stderr.write(
"Usage: ctl stop\n" +
 "\n" +
"Stops the app. For now, this just means that it kills all jobs\n" +
"other than itself.\n"
);
      process.exit(1);
    }

    // Get all jobs (other than this job: don't commit suicide!) that are not
    // already killed.
    var jobs = getJobsByApp(
      myAppName(), {_id: {$ne: myJobId()}, done: false});
    jobs.forEach(function (job) {
      // Don't commit suicide.
      if (job._id === myJobId())
        return;
      // It's dead, Jim.
      if (job.done)
        return;
      kill(job.program, job._id);
    });
    console.log("Server stopped.");
  }
});


Commands.push({
  name: "scale",
  help: "Scale jobs",
  func: function (argv) {
    if (argv.help || argv._.length === 0 || _.contains(argv._, 'ctl')) {
      process.stderr.write(
"Usage: ctl scale program1=n [...] \n" +
 "\n" +
"Scales some programs. Runs or kills jobs until there are n non-done jobs\n" +
"in that state.\n"
);
      process.exit(1);
    }

    var scales = _.map(argv._, function (arg) {
      var m = arg.match(/^(.+)=(\d+)$/);
      if (!m) {
        console.log("Bad scaling argument; should be program=number.");
        process.exit(1);
      }
      return {program: m[1], scale: parseInt(m[2])};
    });

    _.each(scales, function (s) {
      var jobs = getJobsByApp(
        myAppName(), {program: s.program, done: false});
      jobs.forEach(function (job) {
        --s.scale;
        // Is this an extraneous job, more than the number that we need? Kill
        // it!
        if (s.scale < 0) {
          kill(s.program, job._id);
        }
      });
      // Now start any jobs that are necessary.
      if (s.scale <= 0)
        return;
      console.log("Starting %d jobs for %s", s.scale, s.program);
      _.times(s.scale, function () {
        // XXX args? env?
        prettyCall(findGalaxy(), 'run', [myAppName(), s.program, {
          exitPolicy: 'restart'
        }]);
      });
    });
  }
});



// @export main
main = function (argv) {
  var opt = optimist(argv)
    .alias('h', 'help')
    .boolean('help');
  argv = opt.argv;

  if (argv.help) {
    argv._.splice(0, 0, "help");
    delete argv.help;
  }

  var cmdName = 'help';
  if (argv._.length)
    cmdName = argv._.splice(0,1)[0];

  findCommand(cmdName).func(argv);
  return 0;
};
