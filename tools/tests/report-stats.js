var _ = require('underscore');
var os = require("os");

var release = require("../release.js");
var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var stats = require('../stats.js');
var Sandbox = selftest.Sandbox;
var project = require('../project.js');

var testStatsServer = "https://test-package-stats.meteor.com";
process.env.METEOR_PACKAGE_STATS_SERVER_URL = testStatsServer;

// NOTE: This test will fail if your machine's time is skewed by more
// than 30 minutes. This is because the `fetchAppPackageUsage` method
// works by passing an hour time range.
selftest.define("report-stats", ["slow"], function () {
  var s = new Sandbox;

  var run = s.run("create", "foo");
  run.expectExit(0);
  s.cd("foo");

  project.project.setRootDir(s.cwd);

  // verify that identifier file exists for new apps
  var identifier = s.read(".meteor/identifier");
  selftest.expectEqual(!! identifier, true);
  selftest.expectEqual(identifier.length > 0, true);

  // verify that identifier file when running 'meteor bundle' on apps
  // with no identifier file (eg pre-0.9.0 apps)
  bundleWithFreshIdentifier(s);
  identifier = s.read(".meteor/identifier");
  selftest.expectEqual(!! identifier, true);
  selftest.expectEqual(identifier.length > 0, true);

  // we just ran 'meteor bundle' so let's test that we actually sent
  // package usage stats
  var usage = fetchPackageUsageForApp(identifier);
  selftest.expectEqual(_.sortBy(usage.packages, "name"),
                       _.sortBy(stats.packageList(), "name"));

  // verify that the stats server recorded that with no userId
  var appPackages = stats.getPackagesForAppIdInTest();
  selftest.expectEqual(appPackages.appId, identifier);
  selftest.expectEqual(appPackages.userId, null);
  selftest.expectEqual(_.sortBy(appPackages.packages, "name"),
                       _.sortBy(stats.packageList(), "name"));

  // now bundle again while logged in. verify that the stats server
  // recorded that with the right userId
  testUtils.login(s, "test", "testtest");
  bundleWithFreshIdentifier(s);
  appPackages = stats.getPackagesForAppIdInTest();
  selftest.expectEqual(appPackages.userId, testUtils.getUserId(s));

  var expectedUserAgentInfo = {
    hostname: os.hostname(),
    osPlatform: os.platform(),
    osType: os.type(),
    osRelease: os.release(),
    osArch: os.arch()
  };
  if (! release.current.isCheckout()) {
    expectedUserAgentInfo.meteorReleaseTrack = release.getReleaseTrack();
    expectedUserAgentInfo.meteorReleaseVersion = release.getReleaseVersion();
    expectedUserAgentInfo.meteorToolsPackageWithVersion =
      release.getToolsPackageAtVersion();
  }

  selftest.expectEqual(appPackages.meta, expectedUserAgentInfo);

  // Add the opt-out package, verify that no stats are recorded for the
  // app.
  run = s.run("add", "package-stats-opt-out");
  run.waitSecs(15);
  run.expectExit(0);
  bundleWithFreshIdentifier(s);
  appPackages = stats.getPackagesForAppIdInTest();
  selftest.expectEqual(appPackages, undefined);

  // Remove the opt-out package, verify that stats get sent again.
  run = s.run("remove", "package-stats-opt-out");
  run.waitSecs(15);
  run.expectExit(0);
  bundle(s);
  appPackages = stats.getPackagesForAppIdInTest();
  selftest.expectEqual(appPackages.userId, testUtils.getUserId(s));
  selftest.expectEqual(_.sortBy(appPackages.packages, "name"),
                       _.sortBy(stats.packageList(), "name"));
});

// Bundle the app in the current working directory after deleting its
// identifier file (meaning a new one will be created).
// @param s {Sandbox}
var bundleWithFreshIdentifier = function (s) {
  s.unlink(".meteor/identifier");
  bundle(s);
};

// Bundle the app in the current working directory.
// @param s {Sandbox}
var bundle = function (s) {
  var run = s.run("bundle", "foo.tar.gz");
  run.waitSecs(30);
  run.expectExit(0);
  // pick up new app identifier and/or packages added/removed
  // XXX not sure why this is necessary (i.e. why project can't detect
  // that .meteor/identifier or .meteor/packages has changed and figure
  // out that it needs to reload itself)
  project.project.reload();
};

// Contact the package stats server and look for a given app
// identifier reported in the range (now - 30 minutes, now + 30
// minutes). Fails if packages for the same app was not recorded, or
// was recorded more than once.
//
// Returns the (unique) package usage document for the given app.
var fetchPackageUsageForApp = function (identifier) {
  var stats = testUtils.ddpConnect(testStatsServer);
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
