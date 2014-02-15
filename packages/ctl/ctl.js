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
  Ctl.subscribeToAppJobs(Ctl.myAppName());
  var jobs = Ctl.jobsCollection();
  var thisJob = jobs.findOne(Ctl.myJobId());
  Ctl.updateProxyActiveTags(['', thisJob.star]);
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
    var newServersAlreadyPresent = jobs.find({
      app: Ctl.myAppName(),
      star: thisJob.star,
      program: "server",
      done: false
    }).count();
    // discount any new servers we've already started.
    oldServers.splice(0, newServersAlreadyPresent);
    console.log("starting " + oldServers.length + " new servers to match old");
    _.each(oldServers, function (oldServer) {
      Ctl.startServerlikeProgram("server",
                                 oldServer.tags,
                                 oldServer.env.ADMIN_APP);
    });
    // Wait for them all to come up and bind to the proxy.
    var updateProxyActiveTagsOptions = {
      requireRegisteredBindingCount: {}
    };
    // How many new servers should be up when we update the tags, given how many
    // servers we're aiming at:
    var target;
    switch (oldServers.length) {
    case 0:
      target = 0;
      break;
    case 1:
      target = 1;
      break;
    case 2:
      target = 1;
      break;
    default:
      var c = oldServers.length;
      target =  Math.min(c - 1, Math.ceil(c*.8));
      break;
    }
    updateProxyActiveTagsOptions.requireRegisteredBindingCount[thisJob.star] =
      target;
    Ctl.updateProxyActiveTags(['', thisJob.star], updateProxyActiveTagsOptions);

    // (eventually) tell the proxy to switch over to using the new star
    // One by one, kill all the old star's server jobs.
    var jobToKill = jobs.findOne(oldJobSelector);
    while (jobToKill) {
      Ctl.kill("server", jobToKill._id);
      // Wait for it to go down
      waitForDone(jobs, jobToKill._id);
      // Spend some time in between to allow any reconnect storm to die down.
      Meteor._sleepForMs(5000);
      jobToKill = jobs.findOne(oldJobSelector);
    }
    // Now kill all old non-server jobs.  They're less important.
    jobs.find({
      app: Ctl.myAppName(),
      star: {$ne: thisJob.star},
      program: {$ne: "server"},
      done: false
    }).forEach(function (job) {
      Ctl.kill(job.program, job._id);
    });
    // fin
    process.exit(0);
  }
});

main = function (argv) {
  return Ctl.main(argv);
};
