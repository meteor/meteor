var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var stats = require('../stats.js');
var Sandbox = selftest.Sandbox;

// NOTE: This test will fail if your machine's time is skewed by more
// than 30 minutes. This is because the `fetchAppPackageUsage` method
// works by passing an hour time range.
selftest.define("report-stats", function () {
  var s = new Sandbox;

  var run = s.run("create", "foo");
  run.expectExit(0);
  s.cd("foo");

  // verify that identifier file exists for new apps
  var identifier = s.read(".meteor/identifier");
  selftest.expectEqual(!! identifier, true);
  selftest.expectEqual(identifier.length > 0, true);

  // verify that identifier file when running 'meteor bundle' on old
  // apps
  s.unlink(".meteor/identifier");
  run = s.run("bundle", "foo.tar.gz");
  run.waitSecs(30);
  run.expectExit(0);
  identifier = s.read(".meteor/identifier");
  selftest.expectEqual(!! identifier, true);
  selftest.expectEqual(identifier.length > 0, true);

  // we just ran 'meteor bundle' so let's test that we actually sent
  // package usage stats
  var usage = fetchPackageUsageForApp(identifier);
  selftest.expectEqual(usage.packages, stats.packageList(s.cwd));

  // TODO:
  // - test both the logged in state and the logged out state
  // - opt out
});

// Contact the package stats server and look for a given app
// identifier reported in the range (now - 30 minutes, now + 30
// minutes). Fails if packages for the same app was not recorded, or
// was recorded more than once.
//
// Returns the (unique) package usage document for the given app.
var fetchPackageUsageForApp = function (identifier) {
  var stats = testUtils.ddpConnect(/*xcxc*/ "test-packages-stats.meteor.com");
  var nowMinus30Minutes = new Date(new Date - 1000 * 60 * 30 /*ms*/);
  var nowPlus30Minutes = new Date(+nowMinus30Minutes + 1000 * 60 * 60 /*ms*/);
  var usage = stats.call("fetchAppPackageUsage",
             nowMinus30Minutes, nowPlus30Minutes, "like a boss" /*apiKey*/);

  var found = null;
  usage.forEach(function (record) {
    if (record.appId === identifier) {
      if (found) {
        selftest.fail("Found app identifier twice in usage " +
                      "returned from package stats server");
      } else {
        found = record;
      }
    }
  });

  if (! found)
    selftest.fail("Couldn't find app identifier in usage " +
                  "returned from package stats server");

  return found;
};
