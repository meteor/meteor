// exported by package
Profile = Npm.require("meteor-profiler").Profile;

Profile.runContinuously();

// profile GC time
Npm.require("gc-profiler").on('gc', function (info) {
  Profile.increase("GC time", info.duration);
});

// get total CPU time spent by this process, so that we know whether
// we've accounted for everything
var prevTotalMs = 0;
Meteor.setInterval(() => {
  Npm.require('child_process').exec(
    "ps -p " + process.pid + " -o time | tail -1 | head -1",
    (err, stdout) => {
      var units = stdout.replace(":", ".").split(".").map(str => parseInt(str, 10));
      var totalMs = ((units[0] * 60 + units[1]) * 1000) + units[2] * 10;
      console.log("Total CPU time:", totalMs, "\n\n");
    });
}, 10000);


