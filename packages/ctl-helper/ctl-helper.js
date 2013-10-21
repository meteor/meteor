var optimist = Npm.require('optimist');
var Future = Npm.require('fibers/future');

Ctl = {};

var connection;
var checkConnection;

_.extend(Ctl, {
  Commands: [],

  main: function (argv) {
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

    Ctl.findCommand(cmdName).func(argv);
    Ctl.disconnect();
    return 0;
  },

  findCommand: function (name) {
    var cmd = _.where(Ctl.Commands, { name: name })[0];
    if (! cmd) {
      console.log("'" + name + "' is not a ctl command. See 'ctl --help'.");
      process.exit(1);
    }

    return cmd;
  },

  hasProgram: function (name) {
    Ctl.subscribeToAppJobs(Ctl.myAppName());
    var myJob = Ctl.jobsCollection().findOne(Ctl.myJobId());
    var manifest = Ctl.prettyCall(Ctl.findGalaxy(), 'getStarManifest', [myJob.star]);
    if (!manifest)
      return false;
    var found = false;
    return _.find(manifest.programs, function (prog) { return prog.name === name; });
  },

  findGalaxy: _.once(function () {
    if (!('GALAXY' in process.env)) {
      console.log(
        "GALAXY environment variable must be set. See 'galaxy --help'.");
      process.exit(1);
    }

    connection = Follower.connect(process.env['ULTRAWORLD_DDP_ENDPOINT']);
    checkConnection = Meteor.setInterval(function () {
      if (Ctl.findGalaxy().status().status !== "connected" &&
          Ctl.findGalaxy().status().retryCount > 2) {
        console.log("Cannot connect to galaxy; exiting");
        process.exit(3);
      }
    }, 2*1000);
    return connection;
  }),

  disconnect: function () {
    if (connection) {
      connection.disconnect();
    }
    if (checkConnection) {
      Meteor.clearInterval(checkConnection);
      checkConnection = null;
    }
  },

  jobsCollection: _.once(function () {
    return new Meteor.Collection("jobs", {manager: Ctl.findGalaxy()});
  }),

  // use _.memoize so that this is called only once per app.
  subscribeToAppJobs: _.memoize(function (appName) {
    Ctl.findGalaxy()._subscribeAndWait("jobsByApp", [appName]);
  }),

  // XXX this never unsubs...
  getJobsByApp: function (appName, restOfSelector) {
    var galaxy = Ctl.findGalaxy();
    Ctl.subscribeToAppJobs(appName);
    var selector = {app: appName};
    if (restOfSelector)
      _.extend(selector, restOfSelector);
    return Ctl.jobsCollection().find(selector);
  },

  myAppName: _.once(function () {
    if (!('GALAXY_APP' in process.env)) {
      console.log("GALAXY_APP environment variable must be set.");
      process.exit(1);
    }
    return process.env.GALAXY_APP;
  }),

  myJobId: _.once(function () {
    if (!('GALAXY_JOB' in process.env)) {
      console.log("GALAXY_JOB environment variable must be set.");
      process.exit(1);
    }
    return process.env.GALAXY_JOB;
  }),

  usage: function() {
    process.stdout.write(
      "Usage: ctl [--help] <command> [<args>]\n" +
        "\n" +
        "For now, the GALAXY environment variable must be set to the location of\n" +
        "your Galaxy management server (Ultraworld.) This string is in the same\n" +
        "format as the argument to DDP.connect().\n" +
        "\n" +
        "Commands:\n");
    _.each(Ctl.Commands, function (cmd) {
      if (cmd.help && ! cmd.hidden) {
        var name = cmd.name + "                ".substr(cmd.name.length);
        process.stdout.write("   " + name + cmd.help + "\n");
      }
    });
    process.stdout.write("\n");
    process.stdout.write(
      "See 'ctl help <command>' for details on a command.\n");
    process.exit(1);
  },

  // XXX copied to meteor/tools/deploy-galaxy.js
  exitWithError: function (error, messages) {
    messages = messages || {};

    if (! (error instanceof Meteor.Error))
      throw error; // get a stack

    var msg = messages[error.error];
    if (msg)
      process.stderr.write(msg + "\n");
    else if (error instanceof Meteor.Error)
      process.stderr.write("Denied: " + error.message + "\n");

    process.exit(1);
  },

  // XXX copied to meteor/tools/deploy-galaxy.js
  prettyCall: function (galaxy, name, args, messages) {
    try {
      var ret = galaxy.apply(name, args);
    } catch (e) {
      Ctl.exitWithError(e, messages);
    }
    return ret;
  },

  kill: function (programName, jobId) {
  console.log("Killing %s (%s)", programName, jobId);
  Ctl.prettyCall(Ctl.findGalaxy(), 'kill', [jobId]);
  }
});
