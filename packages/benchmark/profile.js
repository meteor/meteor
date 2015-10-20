// exported by package
Profile = Npm.require("meteor-profiler").Profile;

// profile GC time
Npm.require("gc-profiler").on('gc', function (info) {
  Profile.increase("GC time", info.duration);
});


