var _ = require('underscore');
var os = require("os");
var util = require("util");

var auth = require("../auth.js");
var files = require("../files.js");
var config = require("../config.js");
var release = require("../release.js");
var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var stats = require('../stats.js');
var tropohouseModule = require('../tropohouse.js');
var Sandbox = selftest.Sandbox;
var projectContextModule = require('../project-context.js');
var buildmessage = require('../buildmessage.js');

var testStatsServer = "https://test-package-stats.meteor.com";
process.env.METEOR_PACKAGE_STATS_SERVER_URL = testStatsServer;

var clientAddress;

// NOTE: This test will fail if your machine's time is skewed by more
// than 30 minutes. This is because the `fetchAppPackageUsage` method
// works by passing an hour time range.
// XXX I have not managed to get this test passing since introducing
//     isopack-cache, though it seems to just be major server slowness
//     and perhaps preexisting.
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

      s.createApp("foo", "package-stats-tests", {
        release: useFakeRelease ? 'METEOR@v1' : undefined
      });
      s.cd("foo");

      var projectContextOptions = { projectDir: s.cwd };
      if (useFakeRelease) {
        // Make sure that our projectContext knows where the fake tropohouse is.
        projectContextOptions.tropohouse =
          new tropohouseModule.Tropohouse(s.warehouse);
        // This ProjectContext shouldn't notice the packages in the checkout.
        projectContextOptions.ignoreCheckoutPackages = true;
        // It should use the stub official catalog.
        projectContextOptions.officialCatalog = s.warehouseOfficialCatalog;
        // It should be pinned to METEOR@v1.
        projectContextOptions.releaseForConstraints =
          s.warehouseOfficialCatalog.getReleaseVersion("METEOR", "v1");
      }
      var projectContext = new projectContextModule.ProjectContext(
        projectContextOptions);
      selftest.doOrThrow(function () {
        projectContext.prepareProjectForBuild();
      });

      // XXX Copied from http-helpers.js
      var version;
      if (useFakeRelease) {
        version = "METEOR@v1";
      } else {
        version = release.current.isCheckout() ? "checkout" : release.current.name;
      }
      var userAgentForSandbox =
            util.format('Meteor/%s OS/%s (%s; %s; %s;)', version,
                        os.platform(), os.type(), os.release(), os.arch());

      var sessionId;

      // verify that identifier file exists for new apps
      var identifier = projectContext.appIdentifier;
      selftest.expectEqual(!! identifier, true);
      selftest.expectEqual(identifier.length > 0, true);

      // verify that identifier file when running 'meteor run' on apps
      // with no identifier file (eg pre-0.9.0 apps)
      runWithFreshIdentifier(s, projectContext);
      var oldIdentifier = identifier;
      identifier = projectContext.appIdentifier;
      selftest.expectEqual(!! identifier, true);
      selftest.expectEqual(identifier.length > 0, true);
      selftest.expectEqual(oldIdentifier !== identifier, true);

      // we just ran 'meteor run' so let's test that we actually sent
      // package usage stats
      var usage = fetchPackageUsageForApp(identifier);
      selftest.expectEqual(_.sortBy(usage.packages, "name"),
                           _.sortBy(stats.packageList(projectContext), "name"));

      // Check that the direct and local dependency was recorded as such.
      _.each(usage.packages, function (package) {
        if (package.name === "local-package") {
          selftest.expectTrue(package.direct);
          selftest.expectTrue(package.local);
        }
      });

      // verify that the stats server recorded that with no userId
      var appPackages = stats.getPackagesForAppIdInTest(projectContext);
      if (! appPackages) {
        selftest.fail("No packages for app " + identifier + "?");
      }

      var expected = {
        what: "sdk.run",
        sequence: 0,
        details: {},
        ip: getClientAddress(),
        userAgent: userAgentForSandbox
      };

      expected.details.appId = identifier,
      expected.details.packages = _.sortBy(
        stats.packageList(projectContext), "name");

      // read our new session id; we should have one at this point
      sessionId = auth.getSessionId(config.getAccountsDomain(),
                                    JSON.parse(s.readSessionFile()));
      if (! sessionId) {
        selftest.fail("No session id after recording package stats");
      }
      expected.session = sessionId;
      expected.previousSession = null;

      delete appPackages._id;
      delete appPackages.when;
      delete appPackages.host;

      selftest.expectEqual(appPackages, expected);

      // now bundle again while logged in. verify that the stats server
      // recorded that with the right userId and meta information
      testUtils.login(s, "test", "testtest");
      // Our session id should not have changed
      selftest.expectEqual(
        auth.getSessionId(config.getAccountsDomain(),
                          JSON.parse(s.readSessionFile())),
        sessionId
      );

      runWithFreshIdentifier(s, projectContext);
      appPackages = stats.getPackagesForAppIdInTest(projectContext);
      delete appPackages._id;
      delete appPackages.when;
      delete appPackages.host;

      expected.details.appId = projectContext.appIdentifier;
      expected.who = testUtils.getUserId(s);
      delete expected.previousSession;
      selftest.expectEqual(appPackages, expected);

      // Log out, and then test that our session id still gets recorded.
      testUtils.logout(s);
      run = s.run("run");
      run.waitSecs(15);
      run.match("PACKAGE STATS SENT");
      appPackages = stats.getPackagesForAppIdInTest(projectContext);
      delete appPackages._id;
      delete appPackages.when;
      delete appPackages.host;

      delete expected.who;

      selftest.expectEqual(appPackages, expected);

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
      runWithFreshIdentifier(s, projectContext, false /* don't expect stats */);
      appPackages = stats.getPackagesForAppIdInTest(projectContext);
      selftest.expectEqual(appPackages, undefined);

      // Remove the opt-out package, verify that stats get sent again.
      run = s.run("remove", "package-stats-opt-out");
      run.waitSecs(15);
      run.expectExit(0);
      runApp(s, projectContext);
      appPackages = stats.getPackagesForAppIdInTest(projectContext);
      selftest.expectEqual(appPackages.who, testUtils.getUserId(s));
      selftest.expectEqual(_.sortBy(appPackages.details.packages, "name"),
                           _.sortBy(stats.packageList(projectContext), "name"));
    }
  );
});

var refreshProject = function (projectContext) {
  projectContext.reset();
  selftest.doOrThrow(function () {
    projectContext.prepareProjectForBuild();
  });
};

// Run the app in the current working directory after deleting its
// project ID file (meaning a new one will be created).
// @param s {Sandbox}
// @param sandboxProject {Project}
// @param expectStats {Boolean} (defaults to true)
var runWithFreshIdentifier = function (s, projectContext, expectStats) {
  s.unlink(".meteor/.id");
  runApp(s, projectContext, expectStats);
};

// Bundle the app in the current working directory.
// @param s {Sandbox}
// @param sandboxProject {Project}
// @param expectStats {Boolean} (defaults to true)
var runApp = function (s, projectContext, expectStats) {
  if (expectStats === undefined) {
    expectStats = true;
  }

  var run = s.run();
  run.waitSecs(90);
  if (expectStats) {
    run.match("PACKAGE STATS SENT");
  } else {
    run.match("PACKAGE STATS NOT SENT");
  }
  run.stop();
  // Pick up new app identifier and/or packages added/removed.
  refreshProject(projectContext);
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

var getClientAddress = _.once(function () {
  var stats = testUtils.ddpConnect(testStatsServer);
  return stats.call("getClientAddress");
});
