Ctl.Commands.push({
  name: "help",
  func: function (argv) {
    if (!argv._.length || argv.help)
      Ctl.usage();
    var cmd = argv._.splice(0,1)[0];
    argv.help = true;

    Ctl.findCommand(cmd).func(argv);
  }
});

var mergeObjects = function (obj1, obj2) {
  var result = _.clone(obj1);
  _.each(obj2, function (v, k) {
    // If both objects have an object at this key, then merge those objects.
    // Otherwise, choose obj2's value.
    if ((v instanceof Object) && (obj1[k] instanceof Object))
      result[k] = mergeObjects(v, obj1[k]);
    else
      result[k] = v;
  });
  return result;
};



var startFun = function (argv) {
  if (argv.help || argv._.length !== 0) {
    process.stderr.write(
      "Usage: ctl start\n" +
        "\n" +
        "Starts the app. For now, this just means that it runs the 'server'\n" +
        "program.\n"
    );
    process.exit(1);
  }
  if (Ctl.hasProgram("console")) {
    console.log("starting console for app", Ctl.myAppName());
    Ctl.startServerlikeProgramIfNotPresent("console", ["admin"], true);
  }
  console.log("starting server for app", Ctl.myAppName());
  Ctl.startServerlikeProgramIfNotPresent("server", ["runner"]);
};

Ctl.Commands.push({
  name: "start",
  help: "Start this app",
  func: startFun
});


Ctl.Commands.push({
  name: "endUpdate",
  help: "Start this app to end an update",
  func: startFun
});

var stopFun =  function (argv) {
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
  var jobs = Ctl.getJobsByApp(
    Ctl.myAppName(), {_id: {$ne: Ctl.myJobId()}, done: false});
  jobs.forEach(function (job) {
    // Don't commit suicide.
    if (job._id === Ctl.myJobId())
      return;
    // It's dead, Jim.
    if (job.done)
      return;
    Ctl.kill(job.program, job._id);
  });
  console.log("Server stopped.");
};

Ctl.Commands.push({
  name: "stop",
  help: "Stop this app",
  func: stopFun
});


Ctl.Commands.push({
  name: "beginUpdate",
  help: "Stop this app to begin an update",
  func: stopFun
});

Ctl.Commands.push({
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
      var jobs = Ctl.getJobsByApp(
        Ctl.myAppName(), {program: s.program, done: false});
      jobs.forEach(function (job) {
        --s.scale;
        // Is this an extraneous job, more than the number that we need? Kill
        // it!
        if (s.scale < 0) {
          Ctl.kill(s.program, job._id);
        }
      });
      // Now start any jobs that are necessary.
      if (s.scale <= 0)
        return;
      console.log("Starting %d jobs for %s", s.scale, s.program);
      _.times(s.scale, function () {
        // XXX args? env?
        Ctl.prettyCall(Ctl.findGalaxy(), 'run', [Ctl.myAppName(), s.program, {
          exitPolicy: 'restart'
        }]);
      });
    });
  }
});

main = function (argv) {
  return Ctl.main(argv);
};
