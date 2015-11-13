var _= require('underscore');

var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../fs/files.js');
var testUtils = require('../tool-testing/test-utils.js');
var utils = require('../utils/utils.js');
var packageClient = require('../packaging/package-client.js');
var catalog = require('../packaging/catalog/catalog.js');

var DEFAULT_RELEASE_TRACK = catalog.DEFAULT_TRACK;

var username = "test";
var password = "testtest";

// Returns a random package name.
var randomizedPackageName = function (username, start) {
  // We often use package names in long, wrapped string output, so having them
  // be a consistent length is very useful.
  var startStr = start ? start + "-" : "";
  return username + ":" + startStr + utils.randomToken().substring(0, 6);
}

// Returns a random release name.
var randomizedReleaseName = function (username) {
  // We often use package names in long, wrapped string output, so having them
  // be the same length is very useful.
  return username + ":TEST-" +
    utils.randomToken().substring(0, 6).toUpperCase();
}

// Given a sandbox, that has the app as its currend cwd, read the packages file
// and check that it contains exactly the packages specified, in order.
//
// sand: a sandbox, that has the main app directory as its cwd.
// packages: an array of packages in order. Packages can be of the form:
//
//    meteor-base (ie: name), in which case this will match any
//    version of that package as long as it is included.
//
//    awesome-pack@1.0.0 (ie: name@version) to match that name at that
//    version explicitly. This is for packages that we included at a specific
//    version.
var checkPackages = selftest.markStack(function(sand, packages) {
  var lines = sand.read(".meteor/packages").split("\n");
  var i = 0;
  _.each(lines, function(line) {
    if (!line) {
      return;
    }
    // If the specified package contains an @ sign, then it has a version
    // number, so we should match everything.
    if (packages[i].split('@').length > 1) {
      selftest.expectEqual(line, packages[i]);
    } else {
      var pack = line.split('@')[0];
      selftest.expectEqual(pack, packages[i]);
    }
    i++;
  });
  selftest.expectEqual(packages.length, i);
});

// Given a sandbox, that has the app as its currend cwd, read the versions file
// and check that it contains the packages that we are looking for. We don't
// check the order, we just want to make sure that the right dependencies are
// in.
//
// sand: a sandbox, that has the main app directory as its cwd.
// packages: an array of packages in order. Packages can be of the form:
//
//    meteor-base (ie: name), in which case this will match any
//    version of that package as long as it is included. This is for packages
//    external to the app, since we don't want this test to fail when we push a
//    new version.
//
//    awesome-pack@1.0.0 (ie: name@version) to match that name at that
//    version explicitly. This is for packages that only exist for the purpose
//    of this test (for example, packages local to this app), so we know exactly
//    what version we expect.
var checkVersions = selftest.markStack(function(sand, packages) {
  var lines = sand.read(".meteor/versions").split("\n");
  var depend = {};
  _.each(lines, function(line) {
    if (!line) {
      return;
    }
    // Packages are stored of the form foo@1.0.0, so this should give us an
    // array [foo, 1.0.0].
    var split = line.split('@');
    var pack = split[0];
    depend[pack] = split[1];
  });
  var i = 0;
  _.each(packages, function (pack) {
    var split = pack.split('@');
    if (split.length > 1) {
      selftest.expectEqual(depend[split[0]], split[1]);
    } else {
      var exists = _.has(depend, split[0]);
      selftest.expectEqual(exists, true);
    }
    i++;
  });
  selftest.expectEqual(packages.length, i);
});

// Takes in a remote catalog. Returns an object that can sort of immitate the
// catalog. We don't bother to copy all of the information for memory/efficiency
// reasons; the new 'catalog' has the following methods, which correspond to the
// same methods on the normal catalog.
//
//  getAllPackageNames () - list of package names
//  getPackage (p) - given a package name, return its record
//  getSortedVersions (p) - given a package name, return a sorted list of its versions
//  getAllReleaseTracks () - list of release tracks
//  getSortedRecommendedReleaseVersions (t) - given a track name, get (see method name)
//  getReleaseVersion (t, v) - given track & version, return the document record
var DataStub = function (remoteCatalog) {
  var self = this;
  var packageNames = remoteCatalog.getAllPackageNames();
  self.packages = {};
  _.each(packageNames, function (p) {
    var versions = remoteCatalog.getSortedVersions(p);
    var record = remoteCatalog.getPackage(p);
    self.packages[p] = { versions: versions, record: record };
  });
  var releaseTracks = remoteCatalog.getAllReleaseTracks();
  self.releases = {};
  _.each(releaseTracks, function (t) {
    var versions =
          remoteCatalog.getSortedRecommendedReleaseVersions(t);
    var records = {};
    _.each(versions, function (v) {
      records[v] = remoteCatalog.getReleaseVersion(t, v);
    });
    self.releases[t] = { versions: versions, records: records };
  });
};

_.extend(DataStub.prototype, {
  getAllPackageNames: function () {
    return _.keys(this.packages);
  },
  getSortedVersions: function (p) {
    var self = this;
    var rec = self.packages[p];
    if (!rec) {
      return null;
    }
    return rec.versions;
  },
  getPackage: function (p) {
    var self = this;
    var rec = self.packages[p];
    if (!rec) {
      return null;
    }
    return rec.record;
  },
  getAllReleaseTracks: function () {
    return _.keys(this.releases);
  },
  getSortedRecommendedReleaseVersions: function (t) {
    var self = this;
    var rec = self.releases[t];
    if (!rec) {
      return null;
    }
    return rec.versions;
  },
  getReleaseVersion: function (t, v) {
    var self = this;
    var rec = self.releases[t];
    if (!rec) {
      return null;
    }
    return rec.records[v];
  }
});

// Add packages to an app. Change the contents of the packages and their
// dependencies, make sure that the app still refreshes.
selftest.define("change packages during hot code push", [], function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  run = s.run();
  run.waitSecs(5);
  run.match("myapp");
  run.match("proxy");
  run.match("MongoDB");
  run.waitSecs(5);
  run.match("your app");
  run.waitSecs(5);
  run.match("running at");
  run.match("localhost");
  // Add the local package 'say-something'. It should print a message.
  s.write(".meteor/packages", "meteor-base \n say-something");
  run.waitSecs(3);
  run.match("initial");

  // Modify the local package 'say-something'.
  s.cd("packages/say-something", function () {
    s.write("foo.js", "console.log(\"another\");");
  });
  run.waitSecs(12);
  run.match("another");

  // Add a local package depends-on-plugin.
  s.write(".meteor/packages", "meteor-base \n depends-on-plugin");
  run.waitSecs(2);
  run.match("foobar");

  // Change something in the plugin.
  s.cd("packages/contains-plugin/plugin", function () {
    s.write("plugin.js", "console.log(\"edit\");");
  });
  run.waitSecs(2);
  run.match("edit");
  run.match("foobar!");

  // In a local package, add a dependency on a different package.  In this case,
  // package2.js contains an onUse call that tells it to use accounts-base (a
  // core package that is not already included in the app)
  s.cp('packages/contains-plugin/package2.js',
         'packages/contains-plugin/package.js');
  run.waitSecs(2);
  run.match("edit");
  run.match("foobar!");

  // Check that we are watching the versions file, as well as the packages file.
  s.unlink('.meteor/versions');
  run.waitSecs(10);
  run.match("restarted");

  // Switch back to say-something for a moment.
  s.write(".meteor/packages", "meteor-base \n say-something");
  run.waitSecs(3);
  run.match("another");
  run.stop();

  s.rename('packages/say-something', 'packages/shout-something');
  s.write(".meteor/packages", "meteor-base \n shout-something");
  s.cd("packages/shout-something", function () {
    s.write("foo.js", "console.log(\"louder\");");
  });

  run = s.run();
  run.waitSecs(5);
  run.match("myapp");
  run.match("proxy");
  run.match("MongoDB");
  run.waitSecs(5);
  run.match("louder");  // the package actually loaded

  // How about breaking and fixing a package.js?
  s.cd("packages/shout-something", function () {
    var packageJs = s.read("package.js");
    s.write("package.js", "]");
    run.waitSecs(3);
    run.match("=> Errors prevented startup");
    run.match("package.js:1: Unexpected token");
    run.match("Waiting for file change");

    s.write("package.js", packageJs);
    run.waitSecs(3);
    run.match("restarting");
    run.match("restarted");
  });
  run.stop();
});

// Add packages through the command line. Make sure that the correct set of
// changes is reflected in .meteor/packages, .meteor/versions and list.
selftest.define("add packages to app", [], function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_OFFLINE_CATALOG", "t");

  // This has legit version syntax, but accounts-base started with 1.0.0 and is
  // unlikely to backtrack.
  run = s.run("add", "accounts-base@0.123.123");
  run.matchErr("no such version");
  run.expectExit(1);

  // Adding a nonexistent package at a nonexistent version should print
  // only one error message, not two. (We used to print "no such
  // package" and "no such version".)
  run = s.run("add", "not-a-real-package-and-never-will-be@1.0.0");
  run.matchErr("no such package");
  run.expectExit(1);
  run.forbidAll("no such version");

  run = s.run("add", "accounts-base");

  run.match("accounts-base: A user account system");
  run.expectExit(0);

  checkPackages(s,
                ["meteor-base", "accounts-base"]);

  // Adding the nonexistent version now should still say "no such
  // version". Regression test for
  // https://github.com/meteor/meteor/issues/2898.
  run = s.run("add", "accounts-base@0.123.123");
  run.matchErr("no such version");
  run.expectExit(1);
  run.forbidAll("Currently using accounts-base");
  run.forbidAll("will be changed to");

  run = s.run("--once");

  run = s.run("add", "say-something@1.0.0");
  run.match("say-something: print to console");
  run.expectExit(0);

  checkPackages(s,
                ["meteor-base", "accounts-base",  "say-something@1.0.0"]);

  run = s.run("add", "depends-on-plugin");
  run.match(/depends-on-plugin.*added,/);
  run.expectExit(0);

  checkPackages(s,
                ["meteor-base", "accounts-base",
                 "say-something@1.0.0", "depends-on-plugin"]);

  checkVersions(s,
                ["accounts-base",  "depends-on-plugin",
                 "say-something",  "meteor-base",
                 "contains-plugin@1.1.0"]);

  run = s.run("remove", "say-something");
  run.match("say-something: removed dependency");
  checkVersions(s,
                ["accounts-base",  "depends-on-plugin",
                 "meteor-base",
                 "contains-plugin"]);

  run = s.run("remove", "depends-on-plugin");
  run.match(/contains-plugin.*removed from your project/);
  run.match(/depends-on-plugin.*removed from your project/);
  run.match("depends-on-plugin: removed dependency");

  checkVersions(s,
                ["accounts-base",
                 "meteor-base"]);
  run = s.run("list");
  run.match("accounts-base");
  run.match("meteor-base");

  // Add a description-less package. Check that no weird things get
  // printed (like "added no-description: undefined").
  run = s.run("add", "no-description");
  run.match("no-description\n");
  run.expectEnd();
  run.expectExit(0);
});

selftest.define("add debugOnly and prodOnly packages", [], function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_OFFLINE_CATALOG", "t");

    // Add a debugOnly package. It should work during a normal run, but print
  // nothing in production mode.
  run = s.run("add", "debug-only");
  run.match("debug-only");
  run.expectExit(0);

  s.mkdir("server");
  s.write("server/exit-test.js",
          "process.exit(global.DEBUG_ONLY_LOADED ? 234 : 235)");

  run = s.run("--once");
  run.waitSecs(15);
  run.expectExit(234);

  run = s.run("--once", "--production");
  run.waitSecs(15);
  run.expectExit(235);

  // Add prod-only package, which sets GLOBAL.PROD_ONLY_LOADED.
  run = s.run("add", "prod-only");
  run.match("prod-only");
  run.expectExit(0);

  s.mkdir("server");
  s.write("server/exit-test.js", // overwrite
          "process.exit(global.PROD_ONLY_LOADED ? 234 : 235)");

  run = s.run("--once");
  run.waitSecs(15);
  run.expectExit(235);

  run = s.run("--once", "--production");
  run.waitSecs(15);
  run.expectExit(234);
});

selftest.define("add package with both debugOnly and prodOnly", [], function () {
  var s = new Sandbox();
  var run;

  // Add an app with a package with prodOnly and debugOnly set (an error)
  s.createApp("myapp", "debug-only-test", {dontPrepareApp: true});
  s.cd("myapp");
  run = s.run("--prepare-app");
  run.waitSecs(20);
  run.matchErr("can't have both debugOnly and prodOnly");
  run.expectExit(1);
});


// Add a package that adds files to specific client architectures.
selftest.define("add packages client archs", function (options) {
  var runTestWithArgs = function (clientType, args, port) {
    var s = new Sandbox({
      clients: _.extend(options.clients, { port: port })
    });

    // Starting a run
    s.createApp("myapp", "package-tests");
    s.cd("myapp");
      s.set("METEOR_OFFLINE_CATALOG", "t");

    var outerRun = s.run("add", "say-something-client-targets");
    outerRun.match(/say-something-client-targets.*added,/);
    outerRun.expectExit(0);
    checkPackages(s, ["meteor-base", "say-something-client-targets"]);

    var expectedLogNum = 0;
    s.testWithAllClients(function (run) {
      run.waitSecs(5);
      run.match("myapp");
      run.match("proxy");
      run.waitSecs(5);
      run.match("MongoDB");
      run.waitSecs(5);
      run.match("running at");
      run.match("localhost");

      run.connectClient();
      run.waitSecs(20);
      run.match("all clients " + (expectedLogNum++));
      run.match(clientType + " client " + (expectedLogNum++));
      run.stop();
    }, args);
  };

  runTestWithArgs("browser", [], 3000);
});

// `packageName` should be a full package name (i.e. <username>:<package
// name>), and the sandbox should be logged in as that username.
var createAndPublishPackage = selftest.markStack(function (s, packageName) {
  var packageDirName = "package-of-two-versions";
  s.createPackage(packageDirName, packageName, "package-of-two-versions");
  s.cd(packageDirName, function (){
    var run = s.run("publish", "--create");
    run.waitSecs(25);
    run.expectExit(0);
  });
  return packageDirName;
});

selftest.define("release track defaults to METEOR",
                ["net", "test-package-server", "checkout"], function () {

  var s = new Sandbox();
  testUtils.login(s, username, password);
  var fullPackageName = randomizedPackageName(username);
  var releaseVersion = utils.randomToken();

  // Create a package that has a versionsFrom for the just-published
  // release, but without the release track present in the call to
  // `versionsFrom`. This implies that it should be prefixed
  // by "METEOR@"
  var newPack = fullPackageName;
  var newPackDirName = "random-package";
  s.createPackage(newPackDirName, newPack, "package-of-two-versions");
  s.cd(newPackDirName, function() {
    var packOpen = s.read("package.js");
    packOpen = packOpen + "\nPackage.onUse(function(api) { \n" +
      "api.versionsFrom(\"" + releaseVersion + "\");\n" +
      "api.use(\"" + fullPackageName + "\"); });";
    s.write("package.js", packOpen);
  });

  // Try to publish the package. The error message should demonstrate
  // that we indeed default to the METEOR release track when not
  // specified.
  s.cd(newPackDirName, function() {
    var run = s.run("publish", "--create");
    run.waitSecs(20);
    run.matchErr("Unknown release " + DEFAULT_RELEASE_TRACK + "@" + releaseVersion);
    run.expectExit(1);
  });
});

//
// THIS TEST RELIES ON THE TEST SERVER HAVING THE SAME RELEASE AS THE PRODUCTION
// SERVER. YOU *CAN* RUN IT FROM RELEASE IFF YOU PUBLISH A CORRESPONDING RELEASE
// TO THE TEST SERVER. (XXX: fix this post-0.9.0)
//
// XXX: This test is going to take progressively more time as we run more
// tests, and perhaps checks too much information. We should consider
// rethinking it in the future.
selftest.define("update server package data unit test",
                ["net", "test-package-server", "checkout", "slow"],
                function () {
  var s = new Sandbox();
  var run;

  var packageStorageFileDir = files.mkdtemp("update-server-package-data");

  var rC = require('../packaging/catalog/catalog-remote.js');
  var config = require('../meteor-services/config.js');
  var packageStorage = new rC.RemoteCatalog();
  var packageStorageFile = config.getPackageStorage({
    root: packageStorageFileDir,
    serverUrl: s.env.METEOR_PACKAGE_SERVER_URL
  });
  packageStorage.initialize({
    packageStorage : packageStorageFile,
    // Don't let this catalog refresh: we do that manually, and in any case the
    // catalog isn't smart enough to refresh with the right URL.
    offline: true
  });
  testUtils.login(s, username, password);

  // Get the current data from the server. Once we publish new packages,
  // we'll check that all this data still appears on disk and hasn't
  // been overwritten.
  packageClient.updateServerPackageData(packageStorage, {
    packageServerUrl: selftest.testPackageServerUrl
  });

  var oldStorage = new DataStub(packageStorage);

  var newPackageNames = [];
  // Publish more than a (small) page worth of packages. When we pass the
  // `useShortPages` option to updateServerPackageData, the server will send 3
  // records at a time instead of 100, so this is more than a page.
  _.times(5, function (i) {
    var packageName = randomizedPackageName(username);
    createAndPublishPackage(s, packageName);
    newPackageNames.push(packageName);
  });

  packageClient.updateServerPackageData(packageStorage, {
    packageServerUrl: selftest.testPackageServerUrl,
    useShortPages: true
  });

  var packages = oldStorage.getAllPackageNames();
  _.each(packages, function (p) {
    // We could be more pedantic about comparing all the records, but it
    // is a significant effort, time-wise to do that.
    selftest.expectEqual(
      packageStorage.getPackage(p), oldStorage.getPackage(p));
    selftest.expectEqual(
      packageStorage.getSortedVersions(p),
      oldStorage.getSortedVersions(p));
  });
  var releaseTracks = oldStorage.getAllReleaseTracks;
  _.each(releaseTracks, function (t) {
    _.each(oldStorage.getSortedRecommendedReleaseVersions(t),
           function (v) {
             selftest.expectEqual(
               packageStorage.getReleaseVersion(t, v),
               oldStorage.getReleaseVersion(t, v));
           });
  });

  // Check that our newly published packages appear in newData and on disk.
  _.each(newPackageNames, function (name) {
    var found = packageStorage.getPackage(name);
    selftest.expectEqual(!! found, true);
  });
});


// Add packages to an app. Change the contents of the packages and their
// dependencies, make sure that the app still refreshes.
selftest.define("package specifying a name",
    ['test-package-server', "checkout"], function () {
  var s = new Sandbox();
  var run;

  // Starting a run; introducing a new package overriding a core package.
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  run = s.run("add", "accounts-base");
  run.waitSecs(40);
  run.match("accounts-base");

  // Pass --allow-incompatible-update so that when we create a package
  // that overrides accounts-base and has no version number (interpreted
  // as version 0.0.0), we don't get an error about downgrading a
  // a dependency.
  run = s.run("--allow-incompatible-update");
  run.waitSecs(5);
  run.match("myapp");
  run.match("proxy");
  run.match("MongoDB.\n");
  run.waitSecs(10);
  run.match("running at");
  run.match("localhost");

  s.cd("packages", function () {
    s.createPackage("ac-fake", "ac-fake", "fake-accounts-base");
  });

  run.waitSecs(5);
  run.match("overriding accounts-base!");
  run.stop();

  run = s.run('list');
  run.match("accounts-base");
  run.match("meteor");

  // What about test-packages?
  s.cd('packages');
  s.cd('ac-fake');
  // note: use test-in-console because test-in-browser depends on bootstrap
  // and we don't need an atmosphere dependency.
  run = s.run('test-packages', './', '--driver-package=test-in-console');
  run.waitSecs(15);
  run.match("overriding accounts-base!");
  run.stop();
});

selftest.define("talk to package server with expired or no accounts token",
                ['net', 'test-package-server', 'slow'], function () {
  var s = new Sandbox();
  testUtils.login(s, "test", "testtest");

  // Revoke our credential by logging out.
  var session = s.readSessionFile();
  testUtils.logout(s);

  testUtils.login(s, "testtest", "testtest");
  var packageName = "testtest:" + utils.randomToken();
  createAndPublishPackage(s, packageName);
  testUtils.logout(s);

  // When we are not logged in, we should get prompted to log in when we
  // run 'meteor admin maintainers --add'.
  var run = s.run("admin", "maintainers", packageName,
                  "--add", "foo");
  run.waitSecs(15);
  run.matchErr("Username:");
  run.write("test\n");
  run.matchErr("Password:");
  run.write("testtest\n");
  run.waitSecs(15);
  // The 'test' user should not be a maintainer of
  // meteor-base. So this command should fail.
  run.matchErr("You are not an authorized maintainer");
  run.expectExit(1);

  // Now restore our previous session, so that we now have an expired
  // accounts token.
  s.writeSessionFile(session);

  run = s.run("admin", "maintainers", packageName, "--add", "foo");
  run.waitSecs(15);
  run.matchErr("have been logged out");
  run.matchErr("Please log in");
  run.matchErr("Username");
  run.write("test\n");
  run.matchErr("Password:");
  run.write("testtest\n");
  run.waitSecs(15);

  run.matchErr("You are not an authorized maintainer");
  run.expectExit(1);
});

// The cwd of 's' should be a package directory (i.e. with a package.js
// file). Pass 'expectAuthorizationFailure' if you expect the publish
// command to fail because the currently logged-in user is not an
// authorized maintainer of the package.
var changeVersionAndPublish = function (s, expectAuthorizationFailure) {
  var packageJs = s.read("package.js");
  // XXX Hack
  var versionMatch = packageJs.match(/version: \"(\d\.\d\.\d)\"/);
  if (! versionMatch) {
    selftest.fail("package.js does not match version field: " + packageJs);
  }
  var version = versionMatch[1];
  var versionParts = version.split(".");
  versionParts[0] = parseInt(versionParts[0]) + 1;
  packageJs = packageJs.replace(version, versionParts.join("."));
  s.write("package.js", packageJs);

  var run = s.run("publish");
  run.waitSecs(120);
  if (expectAuthorizationFailure) {
    run.matchErr("not an authorized maintainer");
    run.expectExit(1);
  } else {
    run.match("Published");
    run.expectExit(0);
  }
};

selftest.define("packages with organizations",
    ["net", "test-package-server", "slow"], function () {
  var s = new Sandbox();
  testUtils.login(s, "test", "testtest");

  var orgName = testUtils.createOrganization("test", "testtest");

  // Publish a package with 'orgName' as the prefix.
  var packageName = utils.randomToken();
  var fullPackageName = orgName + ":" + packageName;
  var packageDirName = createAndPublishPackage(s, fullPackageName);
  s.cd(packageDirName);

  // 'test' should be a maintainer, as well as 'testtest', once
  // 'testtest' is added to the org.
  changeVersionAndPublish(s);
  testUtils.login(s, "testtest", "testtest");
  changeVersionAndPublish(s, true /* expect authorization failure */);
  testUtils.login(s, "test", "testtest");
  var run = s.run("admin", "members", orgName, "--add", "testtest");
  run.waitSecs(15);
  run.expectExit(0);
  testUtils.login(s, "testtest", "testtest");
  changeVersionAndPublish(s);

  // Removing 'orgName' as a maintainer should fail.
  run = s.run("admin", "maintainers", fullPackageName, "--remove", orgName);
  run.waitSecs(15);
  run.matchErr("remove the maintainer in the package");
  run.expectExit(1);

  // Publish a package with 'test' as the prefix.
  s.cd("..");
  testUtils.login(s, "test", "testtest");
  fullPackageName = "test:" + utils.randomToken();
  var packageDirName2 = createAndPublishPackage(s, fullPackageName);
  s.cd(packageDirName2);

  // Add 'orgName' as a maintainer.
  run = s.run("admin", "maintainers", fullPackageName, "--add", orgName);
  run.waitSecs(20);
  run.match("The maintainers for " + fullPackageName + " are");
  run.match(orgName);
  run.expectExit(0);

  // 'testtest' should now be authorized.
  testUtils.login(s, "testtest", "testtest");
  changeVersionAndPublish(s);

  // Remove 'orgName' as a maintainer: 'testtest' should no longer be
  // authorized.
  testUtils.login(s, "test", "testtest");
  run = s.run("admin", "maintainers", fullPackageName, "--remove", orgName);
  run.waitSecs(15);
  run.match("The maintainers for " + fullPackageName + " are");
  run.forbid(orgName);
  run.expectExit(0);

  testUtils.login(s, "testtest", "testtest");
  changeVersionAndPublish(s, true /* expect authorization failure */);
});

selftest.define("add package with no builds", ["net"], function () {
  var s = new Sandbox();
  // This depends on glasser:binary-package-with-no-builds@1.0.0 existing with
  // no published builds.

  s.createApp("myapp", "empty");
  s.cd("myapp");

  var run = s.run("add", "glasser:binary-package-with-no-builds");
  run.waitSecs(10);
  run.matchErr("glasser:binary-package-with-no-builds@1.0.0");
  run.matchErr("No compatible binary build found");
  run.expectExit(1);
});

selftest.define("package skeleton creates correct versionsFrom", function () {
  var s = new Sandbox({ warehouse: { v1: { recommended: true } } });
  var token = utils.randomToken();
  var fullPackageName = "test:" + token;
  var fsPackageName = token;

  var run = s.run("create", "--package", fullPackageName);
  run.waitSecs(15);
  run.match(fullPackageName);
  run.expectExit(0);

  s.cd(fsPackageName);
  var packageJs = s.read("package.js");
  if (! packageJs.match(/api.versionsFrom\('v1'\);/)) {
    selftest.fail("package.js missing correct 'api.versionsFrom':\n" +
                  packageJs);
  }
});

selftest.define("show unknown version of package", function () {
  var s = new Sandbox();

  // This version doesn't exist and is unlikely to exist.
  var run = s.run("show", "meteor-base@0.123.456");
  run.waitSecs(5);
  run.matchErr("meteor-base@0.123.456: not found");
  run.expectExit(1);

  // This package exists in the server (we need it to publish the tool), but is
  // not a local package.
  run = s.run("show", "npm-bcrypt@local");
  run.waitSecs(5);
  run.matchErr("npm-bcrypt@local: not found");
  run.expectExit(1);

});

selftest.define("circular dependency errors", function () {
  var s = new Sandbox();
  // meteor add refreshes, but we don't need anything from the official catalog
  // here.
  s.set('METEOR_OFFLINE_CATALOG', 't');
  var run;

  // This app contains some pairs of packages with circular dependencies The app
  // currently *uses* no packages, so it can be created successfully.
  s.createApp("myapp", "circular-deps");
  s.cd("myapp");

  // Try to add one of a pair of circularly-depending packages. See an error.
  run = s.run('add', 'first');
  run.matchErr('error: circular dependency');
  run.expectExit(1);

  // Note that the app still builds fine because 'first' didn't actually get
  // added.
  run = s.run('--prepare-app');
  run.expectExit(0);


  // This pair has first-imply uses second-imply, second-imply implies
  // first-imply.
  run = s.run('add', 'first-imply');
  run.matchErr('error: circular dependency');
  run.expectExit(1);

  // This pair has first-weak uses second-weak, second-weak uses first-weak
  // weakly.  Currently, it's possible to add a weak cycle to an app (ie, the
  // prepare-app step passes), but not to run the bundler. We don't want to
  // write a test that prevents us from making the weak cycle an error at
  // prepare-time, so let's skip straight to bundling.
  s.write('.meteor/packages', 'first-weak');
  run = s.run('--once');
  run.matchErr('error: circular dependency');
  run.expectExit(254);

  // ... but we can add second-weak, which just doesn't pull in first-weak at
  // all.
  s.write('.meteor/packages', 'second-weak');
  run = s.run('--once');
  run.match(/first-weak.*removed from your project/);
  run.expectExit(123);  // the app immediately calls process.exit(123)

  // This pair has first-unordered uses second-unordered, second-unordered uses
  // first-unordered unorderedly.  This should work just fine: that's why
  // unordered exists!
  s.write('.meteor/packages', 'first-unordered');
  run = s.run('--once');
  run.match(/first-unordered.*added/);
  run.match(/second-unordered.*added/);
  run.match(/second-weak.*removed from your project/);
  run.expectExit(123);  // the app immediately calls process.exit(123)
});

// Runs 'meteor show <fullPackageName>' without a specified version and checks
// that the output is correct.
//
// - s: sandbox in which to run commands
// - fullPackageName: name of the package to show.
// - options:
//   - summary: Expected summary of the latest version.
//   - description: longform description of the latest version
//   - maintainers: the string of maintainers
//   - homepage: Homepage url, if one was set.
//   - git:  Git url, if one was set.
//   - exports: exports string
//   - implies: implies string
//   - defaultVersion: version that git/exports/etc come from
//   - versions: array of objects representing versions that we have
//     published, with keys:
//     - version: version number (ex: 0.9.9)
//     - date: string we expect to see as the date.
//     - label: string that we expect to see as the label. (ex: "installed")
//   - addendum: a message to display at the bottom.
//   - all: run 'meteor show' with the 'show-all' option.
var testShowPackage =  selftest.markStack(function (s, fullPackageName, options) {
  var run;
  if (options.all) {
    run = s.run("show", "--show-all", fullPackageName);
  } else {
    run = s.run("show", fullPackageName);
  }
  var packageName = options.defaultVersion ?
    fullPackageName + "@" + options.defaultVersion : fullPackageName;
  run.match("Package: " + packageName + "\n");
  if (options.homepage) {
    run.read("Homepage: " + options.homepage + "\n");
  }
  if (options.maintainers) {
    run.read("Maintainers: " + options.maintainers + "\n");
  }
  if (options.git) {
    run.read("Git: " + options.git + "\n");
  }
  if (options.exports) {
    run.read("Exports: " + options.exports + "\n");
  }
  if (options.implies) {
    run.read("Implies: " + options.implies + "\n");
  }
  run.read("\n");
  if (_.has(options, "description")) {
    run.read(options.description + "\n");
  } else if (_.has(options, "summary")) {
    run.read(options.summary + "\n");
  }
  if (options.versions) {
    if (options.all) {
      run.match("Versions:");
    } else {
      run.match("Recent versions:");
    }
    _.each(options.versions, function (version) {
      run.match(version.version);
      if (version.directory) {
        run.match(version.directory + "\n");
      } else {
        run.match(version.date);
        if (version.label) {
          run.match(version.label + "\n");
        } else {
          run.match("\n");
        }
     }
    });
    run.read("\n");
  }
  if (options.addendum) {
    run.read(options.addendum);
  }
  run.expectExit(0);
});

// Runs 'meteor show <name>@<version> and checks that the output is correct.
//
// - s: sandbox
// - options:
//  - packageName: name of the package.
//  - version: version string.
//  - summary: summary string of the package.
//  - description: long-form description of the package
//  - publishedBy: username of the publisher.
//  - publishedOn: string of the publication time.
//  - git: (optional) URL of the git repository.
//  - dependencies: (optional) an array of objects representing dependencies:
//    - name: package name
//    - constraint: constraint, such as "1.0.0" or "=1.0.0" or null.
//    - weak: true if this is a weak dependency.
//  - addendum: a message that we expect to display at the very bottom.
var testShowPackageVersion =  selftest.markStack(function (s, options) {
  var name = options.packageName;
  var version = options.version;
  var run = s.run("show", name + "@" + version);
  run.match("Package: " + name + "@" + version + "\n");
  if (options.directory) {
    run.match("Directory: " + options.directory + "\n");
  }
  if (options.exports) {
    run.read("Exports: " + options.exports + "\n");
  }
  if (options.implies) {
    run.read("Implies: " + options.implies + "\n");
  }
  if (options.git) {
    run.match("Git: " + options.git + "\n");
  }
  if (_.has(options, "description")) {
    run.read("\n");
    run.read(options.description + "\n");
  } else if (_.has(options, "summary")) {
    run.read("\n");
    run.read(options.summary + "\n");
  }
  if (options.dependencies) {
    run.read("\n");
    run.read("Depends on:\n");
    // Use 'read' to ensure that these are the only dependencies listed.
    _.each(options.dependencies, function (dep) {
      var depStr = dep.name;
      if (dep.constraint) {
        depStr += "@" + dep.constraint;
      }
      if (dep.weak) {
        depStr += " (weak dependency)";
      }
      run.read("  " + depStr + "\n");
    });
  }
  if (options.publishedBy) {
    run.match("\n");
    run.match(
      "Published by " + options.publishedBy +
      " on " + options.publishedOn + ".\n");
  }
  if (options.addendum) {
    run.read("\n" + options.addendum + "\n");
  }
  // Make sure that we exit without printing anything else.
  run.expectEnd(0);
});


// For local packages without a version, we want to replace version information
// with the string "local". We also want to make sure that querying for
// 'name@local' gives that local version.
selftest.define("show local package w/o version",  function () {
  var s = new Sandbox();
  var name = "my-local-package" + utils.randomToken();

  // Create a package without version or summary; check that we can show its
  // information without crashing.
  s.createPackage(name, name, "package-for-show");
  var packageDir = files.pathJoin(s.root, "home", name);

  s.cd(name, function () {
    s.cp("package-completely-empty.js", "package.js");
    testShowPackage(s, name, {
      defaultVersion: "local",
      versions: [{ version: "local", directory: packageDir }]
    });

    testShowPackageVersion(s, {
      packageName: name,
      version: "local",
      directory: packageDir
    });

    // Test that running without any arguments also shows this package.
    var run = s.run("show");
    run.match("Package: " + name + "@local\n");
    run.match("Directory: " + packageDir + "\n");
    run.expectExit(0);
  });

  // Test that running without any arguments outside of a package does not
  // work.
  var run = s.run("show");
  run.matchErr("specify a package or release name");
  run.expectExit(1);
});

// Return a formatted string of today’s date.
var longformToday = function () {
  var today = new Date();
  return utils.longformDate(today);
};

// Make sure that a local-only package shows up correctly in show and search
// results.
selftest.define("show and search local package",  function () {
  // Setup: create an app, containing a package. This local package should show
  // up in the results of `meteor show` and `meteor search`.
  var s = new Sandbox();
  var name = "my-local-package" + utils.randomToken();
  s.createApp("myapp", "empty");
  s.cd("myapp");
  s.mkdir("packages");
  s.cd("packages", function () {
    s.createPackage(name, name, "package-for-show");
  });

  var packageDir = files.pathJoin(s.root, "home", "myapp", "packages", name);
  s.cd(packageDir, function () {
    s.cp("package-with-git.js", "package.js");
  });

  var summary = 'This is a test package';
  // Run `meteor show`, but don't add the package to the app yet. We should know
  // that the package exists, even though it hasn't been added to the app.
  testShowPackage(s, name, {
    summary: summary,
    defaultVersion: "local",
    git: 'www.github.com/meteor/meteor',
    versions: [{ version: "1.0.0", directory: packageDir }]
  });

  // Add the package to the app.
  var run = s.run("add", name);
  run.waitSecs(5);
  run.expectExit(0);
  testShowPackage(s, name, {
    summary: summary,
    git: 'www.github.com/meteor/meteor',
    defaultVersion: "local",
    versions: [{ version: "1.0.0", directory: packageDir }]
  });

  // When we run `meteor search`, we should be able to see the results for this
  // package, even though it does not exist on the server.
  run = s.run("search", name);
  run.waitSecs(15);
  run.match(name);
  run.match("You can use");
  run.expectExit(0);

  // We can see exports on local packages.
  s.cd("packages");
  summary = "This is a test package";
  name = "my-local-exports";
  packageDir = files.pathJoin(s.root, "home", "myapp", "packages", name);
  s.createPackage(name, name, "package-for-show");
  s.cd(name, function () {
    s.cp("package-with-exports.js", "package.js");
  });

  var exportStr =
    "A, B (server), C (web.browser, web.cordova), D (web.browser), E (web.cordova), G (server, web.cordova)";
  var description = "Test package.";

  testShowPackage(s, name, {
    summary: summary,
    git: "www.github.com/meteor/meteor",
    exports: exportStr,
    description: description,
    defaultVersion: "local",
    versions: [{ version: "1.0.1", directory: packageDir }]
  });
  testShowPackageVersion(s, {
    packageName: name,
    version: "1.0.1",
    directory: packageDir,
    git: "www.github.com/meteor/meteor",
    summary: summary,
    exports: exportStr,
    description: description
  });

  // Test showing implies. Since we are not going to build the package, we don't
  // have to publish any of the things that we imply.
  var impRaw = {
    A: "",
    B: "server",
    C: "web.browser, web.cordova",
    D: "web.browser",
    E: "web.cordova",
    G: "server, web.cordova"
  };
  var impliesData = _.sortBy(_.map(impRaw, function (label, placeholder) {
    var name =  randomizedPackageName(username, placeholder.toLowerCase());
    return { placeholder: placeholder, name: name, label: label};
  }), 'name');
  s.cd(name, function () {
    s.cp("package-with-implies.js", "package.js");
    var packOpen = s.read("package.js");
    _.each(impliesData, function (d) {
      var repReg = new RegExp("~" + d.placeholder + "~", "g");
      packOpen = packOpen.replace(repReg, d.name);
    });
    s.write("package.js", packOpen);
  });

  summary = "This is a test package";
  description = "Test package.";
  var impArr = _.map(impliesData, function (d) {
    return d.label ? d.name + " (" + d.label + ")" : d.name;
  });
  var impStr =
    impArr[0] + ", " + impArr[1] + ", " +
    impArr[2] + ", " + impArr[3] + ", " +
    impArr[4] + ", " + impArr[5];

  testShowPackage(s, name, {
    summary: summary,
    description: description,
    implies: impStr,
    directory: packageDir,
    defaultVersion: "local",
    git: "www.github.com/meteor/meteor",
    versions: [{ version: "1.2.1", directory: packageDir }]
  });

  // Implies are also dependencies.
  var deps = _.map(impliesData, function (d) {
    return { name: d.name, constraint: "1.0.0" };
  });
  testShowPackageVersion(s, {
    packageName: name,
    version: "1.2.1",
    directory: packageDir,
    description: description,
    summary: summary,
    git: "www.github.com/meteor/meteor",
    implies: impStr,
    dependencies: deps
  });
});

// Make sure that if a package exists both locally, and on the server, 'meteor
// show' and 'meteor search' correctly assign precedence to the local package
// (but still show that the server package exists).
selftest.define("show and search local overrides server",
  ['net', 'test-package-server', 'slow'], function () {
  // Now, for something more interesting. We are going to publish a version of a
  // package, and have a local version available. We want to make sure that all
  // the commands handle this correctly.
  var s = new Sandbox();

  // Technically, this could make our test a little flaky if run at exactly
  // 11:59:59 PM, since the day will switch over before the test is finished. We
  // will never eliminate that possibility completely though, and running this
  // every time we want to check a publication date is sort of expensive.
  var today = longformToday();
  var run;

  testUtils.login(s, username, password);
  var fullPackageName =  randomizedPackageName(username);
  // Publish the first version of this package.
  createAndPublishPackage(s, fullPackageName);

  var packageDirName = "packages-for-show";

  // Create a second version of this package. Inside that package directory, we
  // should be able to see the local package.
  var packageDir = files.pathJoin(s.root, "home", packageDirName);
  s.createPackage(packageDirName, fullPackageName, "package-for-show");
  s.cd(packageDirName, function() {
    s.cp("package-with-git.js", "package.js");
    var summary = "This is a test package";
    var git = "www.github.com/meteor/meteor";
    testShowPackage(s, fullPackageName, {
      maintainers: username,
      summary: summary,
      git: git,
      defaultVersion: "local",
      versions: [
        { version: "1.0.0", date: today },
        { version: "1.0.0", directory: packageDir }
      ]
    });

    // When we ask for version 1.0.0, we get the local version.
    var addendum =
      "This package version is built locally from source. " +
      "The same version of this package also exists on the package server. " +
      "To view its metadata, run 'meteor show " + fullPackageName +
      "@1.0.0' from outside the project.";
    testShowPackageVersion(s, {
      packageName: fullPackageName,
      version: "1.0.0",
      summary: summary,
      git: git,
      directory: packageDir,
      addendum: addendum
    });

    // The description in 'search' should come from the local package.
    run = s.run("search", fullPackageName);
    run.waitSecs(15);
    run.match(summary);
    run.expectExit(0);

    // Test that running without any arguments still gives us the local version.
    run = s.run("show");
    run.match("Package: " + fullPackageName + "@1.0.0\n");
    run.match("Directory: " + packageDir + "\n");
    run.match("Git: " + git + "\n");
    run.read("\n" + summary + "\n");
    run.read("\n" + addendum + "\n");
    run.expectEnd(0);
  });

  // When we run outside of the package directory, we do not see the local
  // versions of this package, and get our information from the server.
  var summary = "Test package.";
  testShowPackage(s, fullPackageName, {
    summary: summary,
    defaultVersion: "1.0.0",
    maintainers: username,
    versions: [
      { version: "1.0.0", date: today }
    ]
  });

  run = s.run("search", fullPackageName);
  run.waitSecs(15);
  run.match(summary);
  run.expectExit(0);
});

// Make sure that we display server packages correctly. Various types of
// packages can exist on the server (and be missing various fields). We should
// be able to handle that properly.
selftest.define("show server package",
  ['net', 'test-package-server', 'slow'], function () {

  // Technically, this could make our test a little flaky if run at exactly
  // 11:59:59 PM, since the day will switch over before the test is finished. We
  // could try to recalculate this after each publication, but we would still
  // run that risk and the test will take even longer.
  var today = longformToday();

  var s = new Sandbox();
  testUtils.login(s, username, password);
  var fullPackageName = randomizedPackageName(username);
  var versions = [];

  // Publish a version the package without git or any dependencies. Make sure
  // that 'show' renders it correctly.
  var packageDirName = "package-for-show";
  s.createPackage(packageDirName, fullPackageName, "package-for-show");
  s.cd(packageDirName, function () {
    var run = s.run("publish", "--create");
    run.waitSecs(30);
    run.expectExit(0);
  });

  var summary = "This is a test package";
  versions.push({ version: "0.9.9", date: today });
  testShowPackage(s, fullPackageName, {
    summary: summary,
    maintainers: username,
    versions: versions,
    defaultVersion: _.last(versions).version,
    description: "Test package."
  });

  testShowPackageVersion(s, {
    packageName: fullPackageName,
    version: "0.9.9",
    publishedBy: username,
    publishedOn: today,
    summary: summary,
    description: "Test package."
  });

  // Publish a version of the package with git, but without any dependencies.
  s.cd(packageDirName, function () {
    s.cp("package-with-git.js", "package.js");
    var run = s.run("publish");
    run.waitSecs(30);
    run.expectExit(0);
  });
  versions.push({ version: "1.0.0", date: today });

  testShowPackage(s, fullPackageName, {
    defaultVersion: _.last(versions).version,
    summary: summary,
    maintainers: username,
    git: "www.github.com/meteor/meteor",
    versions: versions
  });

  testShowPackageVersion(s, {
    packageName: fullPackageName,
    version: "1.0.0",
    publishedBy: username,
    publishedOn: today,
    summary: summary,
    git: "www.github.com/meteor/meteor"
  });

  // Publish a version of the package with exports, and see that they show up.
  s.cd(packageDirName, function () {
    s.cp("package-with-exports.js", "package.js");
    var run = s.run("publish");
    run.waitSecs(30);
    run.expectExit(0);
  });
  versions.push({ version: "1.0.1", date: today });
  var exportStr =
    "A, B (server), C (web.browser, web.cordova)," +
    " D (web.browser), " +
    "E (web.cordova), G (server, web.cordova)";

  testShowPackage(s, fullPackageName, {
    summary: summary,
    maintainers: username,
    exports: exportStr,
    defaultVersion: _.last(versions).version,
    description: "Test package.",
    git: "www.github.com/meteor/meteor",
    versions: versions
  });

  testShowPackageVersion(s, {
    packageName: fullPackageName,
    version: "1.0.1",
    publishedBy: username,
    publishedOn: today,
    exports: exportStr,
    summary: summary,
    git: "www.github.com/meteor/meteor",
    description: "Test package."
  });

  // Publish a version of the package with git that depends on other
  // packages. To do this, we need to publish two other packages (since we don't
  // want to rely on specific packages existing on the test server).
  var baseDependency = randomizedPackageName(username, "base");
  createAndPublishPackage(s, baseDependency);
  var weakDependency = randomizedPackageName(username, "weak");
  createAndPublishPackage(s, weakDependency);
  s.cd(packageDirName, function () {
    // Replace the dependencies placeholders in the package.js file with the
    // packages that we have just published.
    s.cp("package-with-deps.js", "package.js");
    var packOpen = s.read("package.js");
    packOpen = packOpen.replace(/~baseDependency~/g, baseDependency);
    packOpen = packOpen.replace(/~weakDependency~/g, weakDependency);
    s.write("package.js", packOpen);
    var run = s.run("publish");
    run.waitSecs(30);
    run.expectExit(0);
  });

  var newVersions = _.union(versions, [{ version: "1.2.0", date: today }]);
  var newSummary = "This is a test package with dependencies";
  testShowPackage(s, fullPackageName, {
    summary: newSummary,
    maintainers: username,
    defaultVersion: "1.2.0",
    git: "www.github.com/meteor/meteor",
    versions: newVersions
  });

  testShowPackageVersion(s, {
    packageName: fullPackageName,
    version: "1.2.0",
    publishedBy: username,
    publishedOn: today,
    summary: newSummary,
    git: "www.github.com/meteor/meteor",
    dependencies: [
      { name: baseDependency, constraint: "1.0.0" },
      { name: weakDependency, constraint: "=1.0.0", weak: true }
    ]
  });

  // Publish a version of the package with git that implies other packages.

  // Test showing implies. Since we are not going to build the package, we don't
  // have to publish any of the things that we imply.
  var impRaw = {
    A: "",
    B: "server",
    C: "web.browser, web.cordova",
    D: "web.browser",
    E: "web.cordova",
    G: "server, web.cordova"
  };
  var impliesData = _.sortBy(_.map(impRaw, function (label, placeholder) {
    var name =  randomizedPackageName(username, placeholder.toLowerCase());
    createAndPublishPackage(s, name);
    return { placeholder: placeholder, name: name, label: label};
  }), 'name');

  s.cd(packageDirName, function () {
    // Replace the dependencies placeholders in the package.js file with the
    // packages that we have just published.
    s.cp("package-with-implies.js", "package.js");
    var packOpen = s.read("package.js");
    _.each(impliesData, function (d) {
       var repReg = new RegExp("~" + d.placeholder + "~", "g");
       packOpen = packOpen.replace(repReg, d.name);
    });
    s.write("package.js", packOpen);
    var run = s.run("publish");
    run.waitSecs(30);
    run.expectExit(0);
  });

  summary = "This is a test package";
  var impArr = _.map(impliesData, function (d) {
    return d.label ? d.name + " (" + d.label + ")" : d.name;
  });
  var impStr =
    impArr[0] + ", " + impArr[1] + ", " +
    impArr[2] + ", " + impArr[3] + ", " +
    impArr[4] + ", " + impArr[5];

  // Implies are also dependencies.
  var deps = _.map(impliesData, function (d) {
    return { name: d.name, constraint: "1.0.0" };
  });
  versions.push({ version: "1.2.1", date: today });
  newVersions.push({ version: "1.2.1", date: today });
  summary = "This is a test package";
  var description = "Test package.";
  testShowPackage(s, fullPackageName, {
    summary: summary,
    maintainers: username,
    defaultVersion: "1.2.1",
    implies: impStr,
    description: description,
    git: "www.github.com/meteor/meteor",
    versions: versions
  });

  testShowPackageVersion(s, {
    packageName: fullPackageName,
    version: "1.2.1",
    publishedBy: username,
    publishedOn: today,
    summary: summary,
    description: description,
    git: "www.github.com/meteor/meteor",
    implies: impStr,
    dependencies: deps
  });

  // Set a homepage.
  var run = s.run("admin", "change-homepage", fullPackageName, "www.meteor.com");
  run.waitSecs(10);
  run.match("done");
  run.expectExit(0);

  testShowPackage(s, fullPackageName, {
    summary: summary,
    maintainers: username,
    defaultVersion: "1.2.1",
    git: "www.github.com/meteor/meteor",
    homepage: "www.meteor.com",
    versions: versions,
    implies: impStr,
    description: description
  });

  // Add this package to an app, forcing us to download the isopack. Check that
  // the version that we added is marked as installed.
  run = s.run("create", "myApp");
  run.waitSecs(30);
  run.expectExit(0);
  s.cd("myApp", function () {
    var run = s.run("add", fullPackageName + "@1.2.0");
    run.waitSecs(30);
    run.expectExit(0);
  });

  versions = _.initial(versions);
  versions.push({ version: "1.2.1", date: today, label: "installed" });
  testShowPackage(s, fullPackageName, {
    summary: summary,
    maintainers: username,
    defaultVersion: _.last(versions).version,
    git: "www.github.com/meteor/meteor",
    homepage: "www.meteor.com",
    versions: versions,
    implies: impStr,
    description: description
  });

  // Publish a pre-release version of the package.
  s.cd(packageDirName, function () {
    s.cp("package-rc-version.js", "package.js");
    var run = s.run("publish");
    run.waitSecs(30);
    run.expectExit(0);
  });
  // Mark a version of the package as unmigrated.
  run = s.run("admin", "set-unmigrated", fullPackageName + "@1.0.0");
  run.waitSecs(10);
  run.expectExit(0);

  // Neither of these versions should show up.
  var moreAvailable =
    "Pre-release and unmigrated versions of " + fullPackageName +
    " have been hidden. To see all " + "6" +
    " versions, run 'meteor show --show-all " + fullPackageName + "'.";
  testShowPackage(s, fullPackageName, {
    summary: newSummary,
    maintainers: username,
    defaultVersion: _.last(versions).version,
    git: "www.github.com/meteor/meteor",
    homepage: "www.meteor.com",
    versions: [
      { version: "0.9.9", date: today },
      { version: "1.0.1", date: today },
      { version: "1.2.0", date: today },
      { version: "1.2.1", date: today, label: "installed" }
    ],
    implies: impStr,
    description: description,
    addendum: moreAvailable
  });

  newVersions =
    _.union(versions, [{ version: "1.3.0-rc.1", date: today }]);
  // All the versions will show up when we run with the 'show-all' flag.
  testShowPackage(s, fullPackageName, {
    summary: newSummary,
    maintainers: username,
    git: "www.github.com/meteor/meteor",
    homepage: "www.meteor.com",
    versions: newVersions,
    all: true,
    implies: impStr,
    description: description,
    defaultVersion: "1.2.1"
  });

  // If we just query for a specific version, it shows up.
  testShowPackageVersion(s, {
    packageName: fullPackageName,
    version: "1.3.0-rc.1",
    publishedBy: username,
    publishedOn: today,
    // This version is using a different git & description than the previous
    // versions. If this git and/or description ever shows up in the
    // non-version-specific show, that's wrong!
    summary: 'This is a pre-release version of this package!',
    git: "www.github.com/fake-user/meteor"
  });

});

// By default, we don't show unofficial package versions. Make sure that a
// package with only hidden versions is shown in a reasonable manner.
selftest.define("show rc-only package",
  ['net', 'test-package-server', 'slow'], function () {
  var s = new Sandbox();
  testUtils.login(s, username, password);
  var fullPackageName = randomizedPackageName(username);
  var packageDirName = "package-for-show";

  // Create a package that has only an rc version.
  s.createPackage(packageDirName, fullPackageName, "package-for-show");
  s.cd(packageDirName, function () {
    s.cp("package-rc-version.js", "package.js");
    var run = s.run("publish", "--create");
    run.waitSecs(30);
    run.expectExit(0);
  });

  // Run 'meteor show'. There should not be any versions showing up, or any sort
  // of a version header. But we should get an addendum saying that more
  // versions are available.
  var moreAvailable =
    "One pre-release version of " + fullPackageName + " has been hidden. To see " +
    "the hidden version, run 'meteor show --show-all " + fullPackageName + "'.";
  testShowPackage(s, fullPackageName, {
    maintainers: username,
    addendum: moreAvailable
  });
});

// Publishes a release. Takes in a sandbox, a release configuration, and options:
//  - new: create a new track with this release version
var publishRelease = selftest.markStack(function (s, releaseConfig, options) {
  options = options || {};
  var releaseFile = "relconf.json";
  s.write(releaseFile, JSON.stringify(releaseConfig));
  var run;
  if (options.new) {
    run = s.run("publish-release", releaseFile, "--create-track");
  } else {
    run = s.run("publish-release", releaseFile);
  }
  run.match("Done");
  run.expectExit(0);
});

// Tests that 'meteor show <releaseName>' works properly.
// Takes in the following options:
//  - name: release name
//  - maintainers: string of maintainers
//  - description: release description
//  - versions: array of versions that we expect to display, in order. Each
//    version is an object with the following keys:
//    - version (version number)
//    - date  (date published)
//  - addendum: a message to display at the bottom.
var testShowRelease = selftest.markStack(function (s, options) {
  var run = s.run("show", options.name);
  run.waitSecs(10);
  run.match("Release: " + options.name + "\n");
  run.read("Maintainers: " + options.maintainers + "\n");
  run.read("\n");
  if (options.description) {
    run.read(options.description + "\n\n");
  }
  if (options.versions) {
    run.read("Recommended versions:\n");
    _.each(options.versions, function (v) {
      run.match(v.version);
      run.match(v.date + "\n");
    });
    run.read("\n");
  }
  if (options.addendum) {
    var addendum = options.addendum;

    addendum = addendum.replace(/\s+/g, "\\s+") + "\\s+";

    run.read(new RegExp(addendum));
  }
  run.expectEnd(0);
});

// Tests that 'meteor show --show-all <releaseName>' works properly.
// Takes in the following options:
//  - name: release name
//  - maintainers: string of maintainers
//  - description: release description
//  - keyedVersions: array of versions with order keys that we expect to
//    display, in order. Each version is an object with the following keys:
//    - version (version number)
//    - date  (date published)
//    - label (such as "(recommended"))
//  - experimentalVersions: an array of versions without order keys that we
//    expect to display, in order. Have the same keys as keyedVersions, except
//    without a label.
//  - addendum: a message to display at the bottom.
var testShowLongRelease = selftest.markStack(function (s, options) {
  var run = s.run("show", "--show-all", options.name);
  run.waitSecs(10);
  run.match("Release: " + options.name + "\n");
  run.read("Maintainers: " + options.maintainers + "\n");
  if (options.description) {
    run.read("\n" + options.description + "\n");
  }
  run.read("\n");
  if (options.keyedVersions) {
    run.read("Versions:\n");
    _.each(options.keyedVersions, function (v) {
      run.match(v.version);
      run.match(v.date);
      if (v.label) {
        run.match(v.label);
      }
      run.match("\n");
    });
    run.match("\n");
  }
  if (options.experimentalVersions) {
    run.read("Experimental versions:\n");
    _.each(options.experimentalVersions, function (v) {
      run.match(v.version);
      run.match(v.date);
      if (v.label) {
        run.match(v.label);
      }
      run.match("\n");
    });
    run.match("\n");
  }
  run.expectEnd(0);
});

// Tests that 'meteor show <track>@<version>' works and prints out reasonable
// output. Takes in the following options:
//  - name: track name
//  - version: release version to test
//  - publishedBy: username of publisher
//  - publishedOn: date string of publication time
//  - tool: tool package string
//  - recommended: "yes"  for recommended releases, "no" otherwise
//  - packages: an array of objects, with keys "name" (package name) and
//    "version (package version) representing the packages that belong to this
//    release.
var testShowReleaseVersion = selftest.markStack(function (s, options) {
  var run = s.run(
    "show", options.name + "@" + options.version);
  run.waitSecs(10);
  run.match("Release: " + options.name + "@" + options.version + "\n");
  run.read("Recommended: " + options.recommended + "\n");
  run.read("Tool package: " + options.tool + "\n");
  run.read("\n" + options.description + "\n");
  run.read("\n");
  if (options.packages) {
    run.read("Packages:\n");
    _.each(options.packages, function (pkg) {
      run.read("  " + pkg.name + ": " + pkg.version + "\n");
    });
    run.read("\n");
  };
  run.read(
    "Published by " + options.publishedBy + " on " + options.publishedOn + "\n");
  run.expectEnd(0);
});

// Make sure that we show releases and release versions properly.
selftest.define("show release",
  ['net', 'test-package-server', 'slow'], function () {

  var s = new Sandbox();
  testUtils.login(s, username, password);

  // Technically, this could make our test a little flaky if run at exactly
  // 11:59:59 PM, since the day will switch over before the test is finished. We
  // will never eliminate that possibility completely though, and running this
  // every time we want to check a publication date is sort of expensive.
  var today = longformToday();

  // In order to publish a release, we need a package to use as the
  // tool. Publish a package, and use it as the tool. (This release will not
  // actually run, but we are not testing that.)
  var fullPackageName = randomizedPackageName(username);
  createAndPublishPackage(s, fullPackageName);

  // Some base variables that we will use to create a release track.
  var releaseTrack = randomizedReleaseName(username);
  var tool = fullPackageName + "@1.0.0";
  var packages = {};
  packages[fullPackageName] = "1.0.0";
  var baseConfig = {
    track: releaseTrack,
    tool: tool
  };

  // Publish a new release track, and on it, a new recommended release version
  // with this tool and without any packages.
  var recommendedDesc = "first test version";
  var releaseConfig = _.extend(baseConfig, {
    version: "0.0.1",
    recommended: true,
    description: recommendedDesc,
    packages: {}
  });
  publishRelease(s, releaseConfig, { new: true });
  testShowRelease(s, {
    name: releaseTrack,
    description: releaseConfig.description,
    maintainers: username,
    versions: [{ version: "0.0.1", date: today }]
  });
  testShowReleaseVersion(s, {
    name: releaseTrack,
    version: "0.0.1",
    description: releaseConfig.description,
    publishedBy: username,
    publishedOn: today,
    tool: tool,
    recommended: "yes"
  });

  // Publish a non-recommended release version on the same release track. Have
  // this release version contain some packages. (This version was published
  // second, but has a smaller orderKey, so it should show up above the previous
  // version in the results of ‘meteor show’).
  releaseConfig = _.extend(baseConfig, {
    version: "0.0.0.1",
    recommended: false,
    packages: packages,
    description: "second test version"
  });
  publishRelease(s, releaseConfig);
  var moreVersions =
    "One non-recommended version of " + releaseConfig.track + " has been hidden. " +
    "To see all 2 " +
    "versions, run 'meteor show --show-all " + releaseConfig.track + "'.";
  testShowRelease(s, {
    name: releaseTrack,
    description: recommendedDesc,
    maintainers: username,
    versions: [{ version: "0.0.1", date: today }],
    addendum: moreVersions
  });
  testShowLongRelease(s, {
    name: releaseTrack,
    description: recommendedDesc,
    maintainers: username,
    keyedVersions: [
      { version: "0.0.0.1", date: today},
      { version: "0.0.1", date: today, label: "(recommended)" }
    ]
  });
  testShowReleaseVersion(s, {
    name: releaseTrack,
    version: "0.0.0.1",
    description: releaseConfig.description,
    publishedBy: username,
    publishedOn: today,
    tool: tool,
    recommended: "no",
    packages: [{ name: fullPackageName, version: "1.0.0" }]
  });

  // Publish two experimental release versions (no order key at all) and check
  // that they are correctly shown by 'meteor show'.
  releaseConfig = _.extend(baseConfig, {
    version: "cheesecake",
    recommended: false,
    packages: packages,
    description: "just cake"
  });
  publishRelease(s, releaseConfig);
  testShowReleaseVersion(s, {
    name: releaseTrack,
    version: "cheesecake",
    description: releaseConfig.description,
    publishedBy: username,
    publishedOn: today,
    tool: tool,
    recommended: "no",
    packages: [{ name: fullPackageName, version: "1.0.0" }]
  });

  releaseConfig = _.extend(baseConfig, {
    version: "apricot",
    recommended: false,
    packages: packages,
    description: "nom nom nom"
  });
  publishRelease(s, releaseConfig);
  testShowReleaseVersion(s, {
    name: releaseTrack,
    version: "apricot",
    description: releaseConfig.description,
    publishedBy: username,
    publishedOn: today,
    tool: tool,
    recommended: "no",
    packages: [{ name: fullPackageName, version: "1.0.0" }]
  });

  moreVersions =
    "Non-recommended versions of " + releaseConfig.track + " have been hidden. To see all 4 " +
    "versions, run 'meteor show --show-all " + releaseConfig.track + "'.";
  testShowRelease(s, {
    name: releaseTrack,
    description: recommendedDesc,
    maintainers: username,
    versions: [{ version: "0.0.1", date: today }],
    addendum: moreVersions
  });

  testShowLongRelease(s, {
    name: releaseTrack,
    description: recommendedDesc,
    maintainers: username,
    keyedVersions: [
      { version: "0.0.0.1", date: today},
      { version: "0.0.1", date: today, label: "(recommended)" }
    ],
    experimentalVersions: [
      { version: "cheesecake", date: today},
      { version: "apricot", date: today }
    ]
  });
});

selftest.define("show release w/o recommended versions",
  ['net', 'test-package-server', 'slow'], function () {

  var s = new Sandbox();
  testUtils.login(s, username, password);

  // Technically, this could make our test a little flaky if run at exactly
  // 11:59:59 PM, since the day will switch over before the test is finished. We
  // will never eliminate that possibility completely though, and running this
  // every time we want to check a publication date is sort of expensive.
  var today = longformToday();

  // In order to publish a release, we need a package to use as the
  // tool. Publish a package, and use it as the tool. (This release will not
  // actually run, but we are not testing that.)
  var fullPackageName = randomizedPackageName(username);
  createAndPublishPackage(s, fullPackageName);

  // Some base variables that we will use to create a release track.
  var releaseTrack = randomizedReleaseName(username);
  var tool = fullPackageName + "@1.0.0";
  var packages = {};
  packages[fullPackageName] = "1.0.0";
  var baseConfig = {
    track: releaseTrack,
    packages: packages,
    tool: tool
  };

  // Publish two experimental release versions (no order key at all) and check
  // that they are correctly shown by 'meteor show'.
  var releaseConfig = _.extend(baseConfig, {
    version: "cheesecake",
    recommended: false,
    description: "just cake"
  });
  publishRelease(s, releaseConfig, { new: true });

  releaseConfig = _.extend(releaseConfig, {
    version: "apricot",
    recommended: false,
    description: "nom nom nom"
  });
  publishRelease(s, releaseConfig);
  var moreVersions =
    "Non-recommended versions of " + releaseConfig.track + " have been hidden. To see all 2 " +
    "versions, run 'meteor show --show-all " + releaseConfig.track + "'.";

  testShowRelease(s, {
    name: releaseTrack,
    maintainers: username,
    addendum: moreVersions
  });

  testShowLongRelease(s, {
    name: releaseTrack,
    maintainers: username,
    experimentalVersions: [
      { version: "cheesecake", date: today},
      { version: "apricot", date: today }
    ]
  });

  testShowReleaseVersion(s, {
    name: releaseTrack,
    version: "apricot",
    description: releaseConfig.description,
    publishedBy: username,
    publishedOn: today,
    tool: tool,
    recommended: "no",
    packages: [{ name: fullPackageName, version: "1.0.0" }]
  });
});

selftest.define("show package w/many versions",
  ['net', 'test-package-server', 'slow'], function () {

  var s = new Sandbox();
  testUtils.login(s, username, password);

  // Technically, this could make our test a little flaky if run at exactly
  // 11:59:59 PM, since the day will switch over before the test is finished. We
  // will never eliminate that possibility completely though, and running this
  // every time we want to check a publication date is sort of expensive.
  var today = longformToday();

  // Set package version and publish the package.
  var setVersionAndPublish = function (version) {
    var packOpen = s.read("package-version.js");
    packOpen = packOpen.replace(/~version~/g, version);
    s.write("package.js", packOpen);
    var run = s.run("publish");
    run.waitSecs(30);
    run.expectExit(0);
  };
  var fullPackageName = randomizedPackageName(username);
  var packageDirName = "package-of-two-version";
  s.createPackage(packageDirName, fullPackageName, "package-of-two-versions");
  var packageDir = files.pathJoin(s.root, "home", packageDirName);
  s.cd(packageDirName, function () {
    var run = s.run("publish", "--create");
    run.waitSecs(30);
    run.expectExit(0);

    // Publish a couple more versions.
    setVersionAndPublish("1.0.1");
    setVersionAndPublish("1.0.2-rc.1");
    setVersionAndPublish("1.0.5");
    setVersionAndPublish("1.0.6");
    setVersionAndPublish("1.0.7");
    setVersionAndPublish("2.0.0");
    setVersionAndPublish("2.0.1");

    // Make sure that the right versions show up when the local package is visible.
    var moreAvailable =
          "Older versions of " + fullPackageName + " have been hidden. To see " +
          "all 9 versions, run 'meteor show --show-all " + fullPackageName + "'.";
    testShowPackage(s, fullPackageName, {
      maintainers: username,
      summary: "Test package.",
      addendum: moreAvailable,
      defaultVersion: "local",
      versions: [
        { version: "1.0.5", date: today },
        { version: "1.0.6", date: today },
        { version: "1.0.7", date: today },
        { version: "2.0.0", date: today },
        { version: "2.0.1", date: today },
        { version: "2.0.1", directory: packageDir }
      ]
    });

    // Make sure that we list the pre-release version in the list of versions
    // that have been hidden.
    setVersionAndPublish("2.0.0-rc.1");
    setVersionAndPublish("2.0.2");
    moreAvailable =
          "Older and pre-release versions of " + fullPackageName +
          " have been hidden. To see all 11 " +
          "versions, run 'meteor show --show-all " + fullPackageName + "'.";
    testShowPackage(s, fullPackageName, {
      maintainers: username,
      summary: "Test package.",
      defaultVersion: "local",
      addendum: moreAvailable,
      versions: [
        { version: "1.0.6", date: today },
        { version: "1.0.7", date: today },
        { version: "2.0.0", date: today },
        { version: "2.0.1", date: today },
        { version: "2.0.2", date: today },
        { version: "2.0.2", directory: packageDir }
      ]
    });

  });

  // Make sure that the right versions show up when the local package is NOT visible.
  var moreAvailable =
     "Older and pre-release versions of " + fullPackageName + " have been hidden. " +
     "To see all 10 versions, run 'meteor show --show-all " + fullPackageName + "'.";
  testShowPackage(s, fullPackageName, {
    maintainers: username,
    summary: "Test package.",
    defaultVersion: "2.0.2",
    addendum: moreAvailable,
    versions: [
      { version: "1.0.6", date: today },
      { version: "1.0.7", date: today },
      { version: "2.0.0", date: today },
      { version: "2.0.1", date: today },
      { version: "2.0.2", date: today }
    ]
  });
  testShowPackage(s, fullPackageName, {
    all: true,
    maintainers: username,
    summary: "Test package.",
    defaultVersion: "2.0.2",
    versions: [
      { version: "1.0.0", date: today },
      { version: "1.0.1", date: today },
      { version: "1.0.5", date: today },
      { version: "1.0.6", date: today },
      { version: "1.0.7", date: today },
      { version: "2.0.0", date: today },
      { version: "2.0.1", date: today },
      { version: "2.0.2", date: today }
    ]
  });
 });


// This tests that we get the right excerpt out of the Readme.md in different
// combinations. It doesn't test publication, because publishing is slow --
// that's covered in a different test.
selftest.define("show readme excerpt",  function () {
  var s = new Sandbox();
  var name = "my-local-package" + utils.randomToken();

  // Create a package without version or summary; check that we can show its
  // information without crashing.
  s.createPackage(name, name, "package-for-show");
  var packageDir = files.pathJoin(s.root, "home", name);

  // We are just going to change the description in the Readme. Some things
  // about this package are not going to change, and our test will be more
  // legible to factor them out here.
  var basePackageInfo = {
    summary: "This is a test package",
    defaultVersion: "local",
    versions: [{ version: "0.9.9", directory: packageDir }]
  };
  var baseVersionInfo = {
    summary: "This is a test package",
    packageName: name,
    version: "0.9.9",
    directory: packageDir
  };

  s.cd(name);

  // By default, we will use the README.md file for documentation.
  // Start with a blank file. Nothing should show up!
  s.write("README.md", "");
  testShowPackage(s, name, basePackageInfo);
  testShowPackageVersion(s, baseVersionInfo);

  // An example of a standard readme.
  var readme =
        "Heading" + "\n" +
        "========" + "\n" +
        "foobar1" + "\n" +
        "\n" +
        "## Subheading" + "\n" +
        "You should not see this line!";
  s.write("README.md", readme);
  testShowPackage(
    s, name, _.extend({ description: "foobar1" }, basePackageInfo));
  testShowPackageVersion(
    s, _.extend({ description: "foobar1" }, baseVersionInfo));

  // Another example -- we have hidden the excerpt under a different subheading.
  readme =
    "Heading" + "\n" +
    "========" + "\n" +
    "## Subheading" + "\n" +
    "foobar2" + "\n" +
    "## Another subheading" + "\n" +
    "You should not see this line!";
  s.write("README.md", readme);
  testShowPackage(
    s, name, _.extend({ description: "foobar2" }, basePackageInfo));
  testShowPackageVersion(
    s, _.extend({ description: "foobar2" }, baseVersionInfo));

  // Generally, people skip a line between the header and the text, and
  // sometimes, even between headers. (It is part of markdown, in fact.) Let's
  // make sure that we handle that correctly.
  readme =
    "Heading" + "\n" +
    "========" + "\n" + "\n" +
    "## Subheading" + "\n" + "\n" +
    "foobaz" + "\n" + "\n" +
    "## Another subheading" + "\n" + "\n" +
    "You should not see this line!";
  s.write("README.md", readme);
  testShowPackage(
    s, name, _.extend({ description: "foobaz" }, basePackageInfo));
  testShowPackageVersion(
    s, _.extend({ description: "foobaz" }, baseVersionInfo));

  // Some formatting in the text.
  var excerpt =
        "Here is a code sample:" + "\n\n" +
        "```foobar and foobar```";
  readme =
    "Heading" + "\n" +
    "========" + "\n" + "\n" +
    excerpt + "\n\n" +
    "# Subheading" + "\n" + "\n" +
    "## Another subheading" + "\n" + "\n" +
    "You should not see this line!";
  s.write("README.md", readme);
  testShowPackage(
    s, name, _.extend({ description: excerpt }, basePackageInfo));
  testShowPackageVersion(
    s, _.extend({ description: excerpt }, baseVersionInfo));

  // Now, let's try different file specifications for the documentation.
  var git = "https:ilovegit.git";
  var summary = "Test summary";
  var staging = s.read("package-customizable.js");
  staging = staging.replace(/~version~/g, "1.0.0");
  staging = staging.replace(/~git~/g, git);
  staging = staging.replace(/~summary~/g, summary);

  // If we specify null, we have no docs.
  s.write("package.js", staging.replace(/~documentation~/g, "null"));
  baseVersionInfo = {
    summary: summary,
    git: git,
    packageName: name,
    version: "1.0.0",
    directory: packageDir
  };
  basePackageInfo = {
    git: git,
    summary: summary,
    defaultVersion: "local",
    versions: [{ version: "1.0.0", directory: packageDir }]
  };
  testShowPackageVersion(s, baseVersionInfo);
  testShowPackage(s, name, basePackageInfo);

  // If we specify a different file, read that file.
  s.write("package.js",
          staging.replace(/~documentation~/g, "'Meteor-Readme.md'"));
  readme = "A special Readme, just for Meteor.";
  s.write("Meteor-Readme.md", "Title\n==\n" + readme);
  testShowPackageVersion(s,
    _.extend({ description: readme }, baseVersionInfo));
  testShowPackage(s, name,
    _.extend({ description: readme }, basePackageInfo));

  // If we specify a non-existent file, tell us.
  s.write("package.js",
          staging.replace(/~documentation~/g, "'NOTHING'"));
  var run = s.run("show", name);
  run.matchErr("Documentation not found");
  run.expectExit(1);
  run = s.run("show", name + "@1.0.0");
  run.matchErr("Documentation not found");
  run.expectExit(1);
});

// Show publication with different types of readme files.
selftest.define("show server readme",
  ['net', 'test-package-server', 'slow'], function () {

  var s = new Sandbox();
  testUtils.login(s, username, password);

  // Technically, this could make our test a little flaky if run at exactly
  // 11:59:59 PM, since the day will switch over before the test is finished. We
  // will never eliminate that possibility completely though, and running this
  // every time we want to check a publication date is sort of expensive.
  var today = longformToday();
  var fullPackageName = username + ":" + utils.randomToken();
  var packageDirName = "package-for-show";
  s.createPackage(packageDirName, fullPackageName, "package-for-show");
  var summary = "This is a test package";

  // Publish fullPackageName.
  // - isNew: (optional) if true, no other versions of fullPackageName exist, so
  //   run 'publish --create instad of 'publish'.
  var publish = function(isNew) {
    var run;
    if (isNew) {
      run = s.run("publish", "--create");
    } else {
      run = s.run("publish");
    }
    run.waitSecs(30);
    run.expectExit(0);
  };

  // Default docs.
  s.cd(packageDirName, function () {
    publish(true);
  });
  testShowPackageVersion(s, {
    summary: summary,
    publishedBy: username,
    publishedOn: today,
    packageName: fullPackageName,
    version:  "0.9.9",
    description: "Test package."
  });
  testShowPackage(s, fullPackageName, {
    summary: summary,
    defaultVersion: "0.9.9",
    maintainers: username,
    versions: [{ version: "0.9.9", date: today }],
    description: "Test package."
  });

  // Custom Readme! Publish works.
  var git = "https:ilovegit.git";
  var staging;
  s.cd(packageDirName, function () {
    staging = s.read("package-customizable.js");
    staging = staging.replace(/~git~/g, git);
    staging = staging.replace(/~summary~/g, summary);
    var current = staging.replace(/~version~/g, "1.0.0");
    s.write("package.js", current.replace(/~documentation~/g, "'MINE.md'"));
    s.write("MINE.md", "Foobar\n====\nNew test!\n\n# Something\n");
    publish();
  });
  testShowPackageVersion(s, {
    summary: summary,
    git: git,
    publishedBy: username,
    publishedOn: today,
    packageName: fullPackageName,
    version:  "1.0.0",
    description: "New test!"
  });
  testShowPackage(s, fullPackageName, {
    summary: summary,
    git: git,
    defaultVersion: "1.0.0",
    maintainers: username,
    description: "New test!",
    versions: [
      { version: "0.9.9", date: today },
      { version: "1.0.0", date: today }
    ]
  });

  // Null Readme! Publish works.
  s.cd(packageDirName, function () {
    var current = staging.replace(/~version~/g, "1.0.0_1");
    s.write("package.js", current.replace(/~documentation~/g, "null"));
    publish();
  });
  testShowPackageVersion(s, {
    summary: summary,
    git: git,
    packageName: fullPackageName,
    version:  "1.0.0_1",
    publishedBy: username,
    publishedOn: today
  });
  testShowPackage(s, fullPackageName, {
    summary: summary,
    git: git,
    maintainers: username,
    defaultVersion: "1.0.0_1",
    versions: [
      { version: "0.9.9", date: today },
      { version: "1.0.0", date: today },
      { version: "1.0.0_1", date: today }
    ]
  });

  // These cause the publish to fail.
  s.cd(packageDirName, function () {
    // README is blank.
    var current = staging.replace(/~version~/g, "1.0.0_2");
    s.write("package.js", current.replace(/~documentation~/g, "'blank'"));
    s.write("blank", "");
    var run = s.run("publish");
    run.matchErr("Your documentation file is blank");
    run.expectExit(1);

    // README does not exist.
    s.write("package.js", current.replace(/~documentation~/g, "'none'"));
    run = s.run("publish");
    run.matchErr("Documentation not found");
    run.expectExit(1);

    // README is too long.
    s.write("package.js", current.replace(/~documentation~/g, "'long'"));
    var longReadme = Array(75).join(" please do not read me! ");
    s.write("long", "Heading\n===\n" + longReadme);
    run = s.run("publish");
    run.matchErr("Longform package description is too long");
    run.expectExit(1);
  });

  // If you didn't format things properly, we will still publish and use that as
  // an excerpt.
  s.cd(packageDirName, function () {
    var current = staging.replace(/~version~/g, "1.0.0_2");
    s.write("package.js", current.replace(/~documentation~/g, "'unformat'"));
    s.write("unformat", "I did not format this readme");
    publish();
  });
  testShowPackageVersion(s, {
    summary: summary,
    git: git,
    packageName: fullPackageName,
    version:  "1.0.0_2",
    description: "I did not format this readme",
    publishedBy: username,
    publishedOn: today
  });
  testShowPackage(s, fullPackageName, {
    summary: summary,
    git: git,
    maintainers: username,
    defaultVersion: "1.0.0_2",
    description: "I did not format this readme",
    versions: [
      { version: "0.9.9", date: today },
      { version: "1.0.0", date: today },
      { version: "1.0.0_1", date: today },
      { version: "1.0.0_2", date: today }
    ]
  });

});


// Show publication with different types of readme files.
selftest.define("update package metadata",
  ['net', 'test-package-server', 'slow'], function () {

  var s = new Sandbox();
  testUtils.login(s, username, password);

  // Technically, this could make our test a little flaky if run at exactly
  // 11:59:59 PM, since the day will switch over before the test is finished. We
  // will never eliminate that possibility completely though, and running this
  // every time we want to check a publication date is sort of expensive.
  var today = longformToday();
  var fullPackageName = username + ":" + utils.randomToken();
  var packageDirName = "package-for-show";
  s.createPackage(packageDirName, fullPackageName, "package-for-show");
  var summary = "This is a test package";
  var desc = "Test package.";
  var git = "www.iheartgit.git";
  var basePackageVersion = {
    publishedBy: username,
    publishedOn: today,
    packageName: fullPackageName,
    version:  "0.9.9"
  };
  var basePackage = {
    maintainers: username,
    defaultVersion: "0.9.9",
    versions: [{ version: "0.9.9", date: today }]
  };

  var update = function () {
    var run = s.run("publish", "--update");
    run.waitSecs(30);
    run.match("Success.");
    run.expectExit(0);
  };

  // Publish the basic show package, using the default settings.
  s.cd(packageDirName, function () {
    var run = s.run("publish", "--create");
    run.waitSecs(30);
    run.expectExit(0);
  });

  testShowPackageVersion(s, _.extend({
    summary: summary,
    description: desc
  }, basePackageVersion));
  testShowPackage(s, fullPackageName, _.extend({
    summary: summary,
    description: desc
  }, basePackage));

  // add git
  s.cd(packageDirName, function () {
    var staging = s.read("package-customizable.js");
    staging = staging.replace(/~git~/g, git);
    staging = staging.replace(/~summary~/g, summary);
    staging = staging.replace(/~version~/g, "0.9.9");
    staging = staging.replace(/~documentation~/g, "'README.md'");
    s.write("package.js", staging);
    update();
  });

  testShowPackageVersion(s, _.extend({
    summary: summary,
    git: git,
    description: desc
  }, basePackageVersion));
  testShowPackage(s, fullPackageName,  _.extend({
    summary: summary,
    git: git,
    description: desc
  }, basePackage));

  // change git & summary
  git = "https://www.idoNOTheartgit.com";
  summary = "awesome test";
  s.cd(packageDirName, function () {
    var staging = s.read("package-customizable.js");
    staging = staging.replace(/~git~/g, git);
    staging = staging.replace(/~summary~/g, summary);
    staging = staging.replace(/~version~/g, "0.9.9");
    staging = staging.replace(/~documentation~/g, "'README.md'");
    s.write("package.js", staging);
    update();
  });

  testShowPackageVersion(s, _.extend({
    summary: summary,
    git: git,
    description: desc
  }, basePackageVersion));
  testShowPackage(s, fullPackageName,  _.extend({
    summary: summary,
    git: git,
    description: desc
  }, basePackage));

  // change readme contents & summary
  desc = "This test package is super super awesome";
  summary = "more awesome test";
  s.cd(packageDirName, function () {
    var staging = s.read("package-customizable.js");
    staging = staging.replace(/~git~/g, git);
    staging = staging.replace(/~summary~/g, summary);
    staging = staging.replace(/~version~/g, "0.9.9");
    staging = staging.replace(/~documentation~/g, "'README.md'");
    s.write("package.js", staging);
    s.write("README.md", "Test\n===\n"+ desc);
    update();
  });
  testShowPackageVersion(s, _.extend({
    summary: summary,
    git: git,
    description: desc
  }, basePackageVersion));
  testShowPackage(s, fullPackageName,  _.extend({
    summary: summary,
    git: git,
    description: desc
  }, basePackage));

  // change readme contents
  desc = "Actually this test package is OK";
  s.cd(packageDirName, function () {
    s.write("README.md", "OKTest\n===\n"+ desc);
    update();
  });
  testShowPackageVersion(s, _.extend({
    summary: summary,
    git: git,
    description: desc
  }, basePackageVersion));
  testShowPackage(s, fullPackageName,  _.extend({
    summary: summary,
    git: git,
    description: desc
  }, basePackage));

  // change readme file
  desc = "description from new file";
  s.cd(packageDirName, function () {
    var staging = s.read("package-customizable.js");
    staging = staging.replace(/~git~/g, git);
    staging = staging.replace(/~summary~/g, summary);
    staging = staging.replace(/~version~/g, "0.9.9");
    staging = staging.replace(/~documentation~/g, "'NEW-README.md'");
    s.write("package.js", staging);
    s.write("NEW-README.md", "Test\n===\n"+ desc);
    update();
  });
  testShowPackageVersion(s, _.extend({
    summary: summary,
    git: git,
    description: desc
  }, basePackageVersion));
  testShowPackage(s, fullPackageName,  _.extend({
    summary: summary,
    git: git,
    description: desc
  }, basePackage));

  // remove readme
  s.cd(packageDirName, function () {
    var staging = s.read("package-customizable.js");
    staging = staging.replace(/~git~/g, git);
    staging = staging.replace(/~summary~/g, summary);
    staging = staging.replace(/~version~/g, "0.9.9");
    staging = staging.replace(/~documentation~/g, "null");
    s.write("package.js", staging);
    update();
  });
  testShowPackageVersion(s, _.extend({
    summary: summary,
    git: git
  }, basePackageVersion));
  testShowPackage(s, fullPackageName,  _.extend({
    summary: summary,
    git: git
  }, basePackage));

  // try to set an invalid summary
  s.cd(packageDirName, function () {
    // Long summary
    var staging = s.read("package-customizable.js");
    staging = staging.replace(/~git~/g, git);
    var longSummary = Array(30).join(summary);
    staging = staging.replace(/~summary~/g, longSummary);
    staging = staging.replace(/~version~/g, "0.9.9");
    staging = staging.replace(/~documentation~/g, "null");
    s.write("package.js", staging);

    var run = s.run("publish", "--update");
    run.matchErr("Summary must be under");
    run.expectExit(1);

    // Blank summary.
    staging = s.read("package-customizable.js");
    staging = staging.replace(/~git~/g, git);
    staging = staging.replace(/~summary~/g, "");
    staging = staging.replace(/~version~/g, "0.9.9");
    staging = staging.replace(/~documentation~/g, "null");
    s.write("package.js", staging);
    run = s.run("publish", "--update");
    run.matchErr("Please provide");
    run.expectExit(1);

  });
  testShowPackageVersion(s, _.extend({
    summary: summary,
    git: git
  }, basePackageVersion));
  testShowPackage(s, fullPackageName,  _.extend({
    summary: summary,
    git: git
  }, basePackage));


  // try to set an invalid readme
  s.cd(packageDirName, function () {
    var staging = s.read("package-customizable.js");
    staging = staging.replace(/~git~/g, git);
    var longSummary = Array(30).join(summary);
    staging = staging.replace(/~summary~/g, summary);
    staging = staging.replace(/~version~/g, "0.9.9");
    staging = staging.replace(/~documentation~/g, "'longReadme.md'");
    s.write("package.js", staging);
    var longDesc = Array(75).join("this is a very long text ");
    s.write("longReadme.md", "Heading\n===\n" + longDesc);

    var run = s.run("publish", "--update");
    run.matchErr("Longform package description is too long.");
    run.expectExit(1);
  });

  // try to update non-existent version
  s.cd(packageDirName, function () {
    var staging = s.read("package-customizable.js");
    staging = staging.replace(/~git~/g, git);
    staging = staging.replace(/~summary~/g, summary);
    staging = staging.replace(/~version~/g, "2.0.0");
    staging = staging.replace(/~documentation~/g, "null");
    s.write("package.js", staging);

    var run = s.run("publish", "--update");
    run.matchErr("without publishing it first");
    run.expectExit(1);
  });

  // try to update non-existent package
  var newPackageName = username + ":" + utils.randomToken();
  var newPackageDirName = "packages-for-show";
  s.createPackage(newPackageDirName, newPackageName, "package-for-show");
  s.cd(newPackageDirName, function () {
    var run = s.run("publish", "--update");
    run.matchErr("without publishing it first");
    run.expectExit(1);

    run = s.run("publish", "--create");
    run.waitSecs(30);
    run.expectExit(0);
  });

  // try to update dependencies, they don't get upated! (But it still goes
  // through, for now).
  s.cd(packageDirName, function () {
    var staging = s.read("package-customizable.js");
    staging = staging.replace(/~git~/g, git);
    staging = staging.replace(/~summary~/g, summary);
    staging = staging.replace(/~version~/g, "0.9.9");
    staging = staging.replace(/~documentation~/g, "null");
    staging = staging + "\nPackage.onUse(function (api) {\n" +
      "api.use('" + newPackageName + "@1.0.0');\n})\n";
    s.write("package.js", staging);
    update();
 });
  testShowPackageVersion(s, _.extend({
    summary: summary,
    git: git
  }, basePackageVersion));
  testShowPackage(s, fullPackageName,  _.extend({
    summary: summary,
    git: git
  }, basePackage));

  // By the way, you can't update from outside a Meteor package directory.
  var run = s.run("publish", "--update");
  run.matchErr("You're not in a Meteor package directory");
  run.expectExit(1);
});

// Regression test for #3676.
selftest.define("publish prebuilt package", ["net", "test-package-server", "slow"], function () {
  var s = new Sandbox();
  var fullPackageName = randomizedPackageName(username);

  s.createApp("myapp", "empty");
  s.cd("myapp");
  // This bug required the app to have a Cordova platform, so that the app's
  // cache would be built with the cordova unibuild which matches what we're
  // trying to publish.
  s.write('.meteor/platforms', 'server\nbrowser\nandroid\n');

  s.mkdir('packages');
  s.cd('packages');
  s.createPackage('p', fullPackageName, 'package-for-show');

  // This adds the package and saves a built version of it to the local
  // IsopackCache.
  var run = s.run('add', fullPackageName);
  run.expectExit(0);

  s.cd('p');

  testUtils.login(s, username, password);
  // Before fixing #3676, this crashed because it didn't read the
  // pluginProviderPackageMap from the IsopackCache.
  var run = s.run('publish', '--create');
  run.waitSecs(30);
  run.match('Published');
  run.expectExit(0);
});
