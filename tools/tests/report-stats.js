var _ = require('underscore');
var os = require("os");

var auth = require("../auth.js");
var config = require("../config.js");
var release = require("../release.js");
var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var stats = require('../stats.js');
var Sandbox = selftest.Sandbox;
var project = require('../project.js');
var buildmessage = require('../buildmessage.js');

var testStatsServer = "https://test-package-stats.meteor.com";
process.env.METEOR_PACKAGE_STATS_SERVER_URL = testStatsServer;

var clientAddress;

var checkMeta = function (appPackages, sessionId, useFakeRelease) {
  if (! clientAddress) {
    clientAddress = getClientAddress();
  }

  var expectedUserAgentInfo = {
    hostname: os.hostname(),
    osPlatform: os.platform(),
    osType: os.type(),
    osRelease: os.release(),
    osArch: os.arch(),
    clientAddress: clientAddress
  };

  if (sessionId) {
    expectedUserAgentInfo.sessionId = sessionId;
  }

  if (useFakeRelease) {
    var toolsPackage;
    selftest.doOrThrow(function() {
      toolsPackage = selftest.getToolsPackage();
    });
    expectedUserAgentInfo.meteorReleaseTrack =
      "METEOR-CORE";
    expectedUserAgentInfo.meteorReleaseVersion =
      "v1";
    expectedUserAgentInfo.meteorToolsPackageWithVersion =
      toolsPackage.name + "@" + toolsPackage.version;
  } else {
    expectedUserAgentInfo.meteorReleaseTrack =
      release.current.getReleaseTrack();
    expectedUserAgentInfo.meteorReleaseVersion =
      release.current.getReleaseVersion();
    expectedUserAgentInfo.meteorToolsPackageWithVersion =
      release.current.getToolsPackageAtVersion();
  }

  selftest.expectEqual(appPackages.meta, expectedUserAgentInfo);

};

// NOTE: This test will fail if your machine's time is skewed by more
// than 30 minutes. This is because the `fetchAppPackageUsage` method
// works by passing an hour time range.
selftest.define("report-stats", ["slow", "net"], function () {
  _.each(
    // If we are currently running from a checkout, then we run this
    // test twice (once in which the sandbox uses the current checkout,
    // and another in which the sandbox uses a simulated release). If we
    // are currently running from a release, then we can only have the
    // sandbox use a simulated release that is the same as our current
    // release (we can't simulate a checkout).
    release.current.isCheckout() ? [true, false] : [false],
    function (useFakeRelease) {
      var sandboxOpts;
      if (useFakeRelease) {
        sandboxOpts = {
          warehouse: {
            v1: { recommended: true }
          }
        };
      }
      var s = new Sandbox(sandboxOpts);
      s.env.METEOR_PACKAGE_STATS_TEST_OUTPUT = "t";

      var run;

      if (useFakeRelease) {
        // This makes packages not depend on meteor (specifically, makes
        // our empty control program not depend on meteor). We don't
        // want to depend on meteor when running from a fake release,
        // because fake releases don't have any packages.
        s.set("NO_METEOR_PACKAGE", "t");
      }

      s.createApp("foo", "package-stats-tests");
      s.cd("foo");
      if (useFakeRelease) {
        s.write('.meteor/release', 'METEOR-CORE@v1');
      }

      var sandboxProject = new project.Project();
      sandboxProject.setRootDir(s.cwd);

      var sessionId;

      // verify that identifier file exists for new apps
      var identifier = s.read(".meteor/identifier").replace(/\n$/, '');
      selftest.expectEqual(!! identifier, true);
      selftest.expectEqual(identifier.length > 0, true);

      // verify that identifier file when running 'meteor run' on apps
      // with no identifier file (eg pre-0.9.0 apps)
      runWithFreshIdentifier(s, sandboxProject);

      identifier = s.read(".meteor/identifier");
      selftest.expectEqual(!! identifier, true);
      selftest.expectEqual(identifier.length > 0, true);

      // we just ran 'meteor run' so let's test that we actually sent
      // package usage stats
      var usage = fetchPackageUsageForApp(identifier);
      selftest.expectEqual(_.sortBy(usage.packages, "name"),
                           _.sortBy(packageList(sandboxProject), "name"));

      // Check that the direct dependency was recorded as such.
      _.each(usage.packages, function (package) {
        if (package.name === "local-package" &&
            ! package.direct) {
          selftest.fail("local-package is not marked as a direct dependency");
        }
      });

      // verify that the stats server recorded that with no userId
      var appPackages = stats.getPackagesForAppIdInTest(sandboxProject);
      selftest.expectEqual(appPackages.appId, identifier);
      selftest.expectEqual(appPackages.userId, null);
      selftest.expectEqual(_.sortBy(appPackages.packages, "name"),
                           _.sortBy(packageList(sandboxProject), "name"));
      checkMeta(appPackages, sessionId, useFakeRelease);

      // now bundle again while logged in. verify that the stats server
      // recorded that with the right userId and meta information
      testUtils.login(s, "test", "testtest");
      sessionId = auth.getSessionId(config.getAccountsDomain(),
                                    JSON.parse(s.readSessionFile()));

      runWithFreshIdentifier(s, sandboxProject);
      appPackages = stats.getPackagesForAppIdInTest(sandboxProject);
      selftest.expectEqual(appPackages.userId, testUtils.getUserId(s));
      checkMeta(appPackages, sessionId, useFakeRelease);

      // Log out, and then test that our session id still gets recorded.
      testUtils.logout(s);
      run = s.run("run");
      run.waitSecs(15);
      run.match("BLAH");
      appPackages = stats.getPackagesForAppIdInTest(sandboxProject);
      selftest.expectEqual(appPackages.userId, null);
      checkMeta(appPackages, sessionId, useFakeRelease);
      run.stop();

      testUtils.login(s, "test", "testtest");

      // Add the opt-out package, verify that no stats are recorded for the
      // app.
      //
      // XXX The app has a local package-stats-opt-out package in it, so
      // that we can add the opt-out package without needing to be using
      // a release that knows about the opt-out package. (Our sandbox
      // release only has the tool package and no others.) In the near
      // future we should just have a way to simulate a release in a
      // sandbox that knows about all the packages in the meteor release
      // or checkout that is running 'meteor self-test'. That will
      // simplify this test a lot.
      run = s.run("add", "package-stats-opt-out");
      run.waitSecs(15);
      run.expectExit(0);
      runWithFreshIdentifier(s, sandboxProject, false /* don't expect stats */);
      appPackages = stats.getPackagesForAppIdInTest(sandboxProject);
      selftest.expectEqual(appPackages, undefined);

      // Remove the opt-out package, verify that stats get sent again.
      run = s.run("remove", "package-stats-opt-out");
      run.waitSecs(15);
      run.expectExit(0);
      runApp(s, sandboxProject);
      appPackages = stats.getPackagesForAppIdInTest(sandboxProject);
      selftest.expectEqual(appPackages.userId, testUtils.getUserId(s));
      selftest.expectEqual(_.sortBy(appPackages.packages, "name"),
                           _.sortBy(packageList(sandboxProject), "name"));
    }
  );
});

// Run the app in the current working directory after deleting its
// identifier file (meaning a new one will be created).
// @param s {Sandbox}
// @param sandboxProject {Project}
// @param expectStats {Boolean} (defaults to true)
var runWithFreshIdentifier = function (s, sandboxProject, expectStats) {
  s.unlink(".meteor/identifier");
  runApp(s, sandboxProject, expectStats);
};

// Bundle the app in the current working directory.
// @param s {Sandbox}
// @param sandboxProject {Project}
// @param expectStats {Boolean} (defaults to true)
var runApp = function (s, sandboxProject, expectStats) {
  if (expectStats === undefined) {
    expectStats = true;
  }

  var run = s.run();
  run.waitSecs(30);
  if (expectStats) {
    run.match("PACKAGE STATS SENT");
  } else {
    run.match("PACKAGE STATS NOT SENT");
  }
  run.stop();
  // Pick up new app identifier and/or packages added/removed. Usually the
  // changes to .meteor/packages and .meteor/identifier would be handled by the
  // code that handles the hotcodepush, so the project does not cache them.
  sandboxProject.reload();
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

var getClientAddress = function () {
  var stats = testUtils.ddpConnect(testStatsServer);
  return stats.call("getClientAddress");
};

var packageList = function (proj) {
  var ret;
  var messages = buildmessage.capture(function () {
    ret = stats.packageList(proj);
  });
  if (messages.hasMessages()) {
    selftest.fail(messages.formatMessages());
  }
  return ret;
};
