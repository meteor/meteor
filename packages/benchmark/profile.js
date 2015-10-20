// exported by package
Profile = Npm.require("meteor-profiler").Profile;

var getrusage = Npm.require("getrusage");

Profile.runContinuously();

// profile GC time
Npm.require("gc-profiler").on('gc', function (info) {
  Profile.increase("GC time", info.duration);
});

// get total CPU time spent by this process, so that we know whether
// we've accounted for everything
var prevTotalMs = 0;
Meteor.setInterval(() => {
  console.log("Total CPU time: ", 1000 * getrusage.getcputime());
}, 10000);


