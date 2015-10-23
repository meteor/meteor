var getrusage = Npm.require("getrusage");

var startCPUTime;

// The `ddp-server` package depends on this package, so this package
// can only depend on `ddp-server` "unordered"ly. Meaning
// `Meteor.methods` isn't defined when this file is first executed.
Meteor.defer(() => {
  Meteor.methods({
    "deepCPUProfiler.start": function () {
      Profile.start();
      startCPUTime = 1000 * getrusage.getcputime();
      return true;
    },
    "deepCPUProfiler.stop": function () {
      var endCPUTime = 1000 * getrusage.getcputime();
      return {text: Profile.stop(), cpuTime: endCPUTime - startCPUTime};
    }
  });
});
