var Future = Npm.require("fibers/future");

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

var waitForDone = function (jobCollection, jobId) {
  var fut = new Future();
  var found = false;
  try {
    var observation = jobCollection.find(jobId).observe({
      added: function (doc) {
        found = true;
        if (doc.done)
          fut['return']();
      },
      changed: function (doc) {
        if (doc.done)
          fut['return']();
      },
      removed: function (doc) {
        fut['return']();
      }
    });
    // if the document doesn't exist at all, it's certainly done.
    if (!found)
      fut['return']();
    fut.wait();
  } finally {
    observation.stop();
  }
};


Ctl.Commands.push({
  name: "beginUpdate",
  help: "Stop this app to begin an update",
  func: function (argv) {
    Ctl.subscribeToAppJobs(Ctl.myAppName());
    var jobs = Ctl.jobsCollection();
    var thisJob = jobs.findOne(Ctl.myJobId());
    // Look at all the server jobs that are on the old star.
    var oldJobSelector = {
      app: Ctl.myAppName(),
      star: {$ne: thisJob.star},
      program: "server",
      done: false
    };
    var oldServers = jobs.find(oldJobSelector).fetch();
    // Start a new job for each of them.
    _.each(oldServers, function (oldServer) {
      Ctl.startServerlikeProgram("server", oldServer.tags, oldServer.env.ADMIN_APP);
    });
    // Wait for them all to come up and bind to the proxy.
    Meteor._sleepForMs(5000); // XXX: Eventually make sure they're proxy-bound.
    // (eventually) tell the proxy to switch over to using the new star
    // One by one, kill all the old star's server jobs.
    var jobToKill = jobs.findOne(oldJobSelector);
    while (jobToKill) {
      Ctl.kill("server", jobToKill._id);
      // Wait for it to go down
      waitForDone(jobs, jobToKill._id);
      // Spend some time in between to allow any reconnect storm to die down.
      Meteor._sleepForMs(1000);
      jobToKill = jobs.findOne(oldJobSelector);
    }
    // Now kill all non-server jobs.  They're less important.
    jobs.find({
      app: Ctl.myAppName(),
      star: {$ne: thisJob.star},
      program: {$ne: "server"},
      done: false
    }).forEach(function (job) {
      Ctl.kill(job.program, job._id);
    });
    // fin
  }
});

main = function (argv) {
  return Ctl.main(argv);
};
