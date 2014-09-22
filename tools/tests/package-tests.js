var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');
var testUtils = require('../test-utils.js');
var utils = require('../utils.js');
var _= require('underscore');
var fs = require("fs");
var path = require("path");
var packageClient = require("../package-client.js");

var username = "test";
var password = "testtest";


// Given a sandbox, that has the app as its currend cwd, read the packages file
// and check that it contains exactly the packages specified, in order.
//
// sand: a sandbox, that has the main app directory as its cwd.
// packages: an array of packages in order. Packages can be of the form:
//
//    meteor-platform (ie: name), in which case this will match any
//    version of that package as long as it is included.
//
//    awesome-pack@1.0.0 (ie: name@version) to match that name at that
//    version explicitly. This is for packages that we included at a specific
//    version.
var checkPackages = function(sand, packages) {
  var lines = sand.read(".meteor/packages").split("\n");
  var i = 0;
  _.each(lines, function(line) {
    if (!line) return;
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
};

// Given a sandbox, that has the app as its currend cwd, read the versions file
// and check that it contains the packages that we are looking for. We don't
// check the order, we just want to make sure that the right dependencies are
// in.
//
// sand: a sandbox, that has the main app directory as its cwd.
// packages: an array of packages in order. Packages can be of the form:
//
//    meteor-platform (ie: name), in which case this will match any
//    version of that package as long as it is included. This is for packages
//    external to the app, since we don't want this test to fail when we push a
//    new version.
//
//    awesome-pack@1.0.0 (ie: name@version) to match that name at that
//    version explicitly. This is for packages that only exist for the purpose
//    of this test (for example, packages local to this app), so we know exactly
//    what version we expect.
var checkVersions = function(sand, packages) {
  var lines = sand.read(".meteor/versions").split("\n");
  var depend = {};
  _.each(lines, function(line) {
    if (!line) return;
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
};

// Add packages to an app. Change the contents of the packages and their
// dependencies, make sure that the app still refreshes.
selftest.define("change packages during hot code push", [], function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.mkdtemp());
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
  s.write(".meteor/packages", "meteor-platform \n say-something");
  run.waitSecs(3);
  run.match("initial");
  run.match("restarted");

  // Modify the local package 'say'something'.
  s.cd("packages/say-something", function () {
    s.write("foo.js", "console.log(\"another\");");
  });
  run.waitSecs(12);
  run.match("another");
  run.match("restarted");

  // Add a local package depends-on-plugin.
  s.write(".meteor/packages", "meteor-platform \n depends-on-plugin");
  run.waitSecs(2);
  run.match("foobar");
  run.match("restarted");

  // Change something in the plugin.
  s.cd("packages/contains-plugin/plugin", function () {
    s.write("plugin.js", "console.log(\"edit\");");
  });
  run.waitSecs(2);
  run.match("edit");
  run.match("foobar!");
  run.match("restarted");

  // In a local package, add a dependency on a different package.  In this case,
  // package2.js contains an onUse call that tells it to use accounts-base (a
  // core package that is not already included in the app)
  s.cp('packages/contains-plugin/package2.js',
         'packages/contains-plugin/package.js');
  run.waitSecs(2);
  run.match("edit");
  run.match("foobar!");
  run.match("restarted");

  // Add packages to sub-programs of an app. Make sure that the correct change
  // is propagated to its versions file.
  s.cp('programs/empty/package2.js', 'programs/empty/package.js');

  run.waitSecs(2);
  run.match("restarted");

  // Switch back to say-something for a moment.
  s.write(".meteor/packages", "meteor-platform \n say-something");
  run.waitSecs(3);
  run.match("another");
  run.match("restarted");
  run.stop();

  s.rename('packages/say-something', 'packages/shout-something');
  s.write(".meteor/packages", "meteor-platform \n shout-something");
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
  run.match("your app");
  run.waitSecs(5);
  run.match("running at");
  run.match("localhost");

  // How about breaking and fixing a package.js?
  s.cd("packages/shout-something", function () {
    var packageJs = s.read("package.js");
    s.write("package.js", "]");
    run.waitSecs(3);
    run.match("=> Errors prevented startup");
    run.match("package.js:1:1: Unexpected token ]");
    run.match("Waiting for file change");

    s.write("package.js", packageJs);
    run.waitSecs(3);
    run.match("restarting");
    run.match("restarted");
  });
  run.stop();
});

// Add packages through the command line, and make sure that the correct set of
// changes is reflected in .meteor/packages, .meteor/versions and list
selftest.define("add packages to app", ["net"], function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.mkdtemp());
  s.set("METEOR_OFFLINE_CATALOG", "t");

  run = s.run("add", "accounts-base");

  run.match("accounts-base: A user account system");
  run.expectExit(0);

  checkPackages(s,
                ["meteor-platform", "accounts-base"]);

  run = s.run("--once");

  run = s.run("add", "say-something@1.0.0");
  run.match("say-something: print to console");
  run.expectExit(0);

  checkPackages(s,
                ["meteor-platform", "accounts-base",  "say-something@1.0.0"]);

  run = s.run("add", "depends-on-plugin");
  run.match(" added");
  run.match("depends-on-plugin");
  run.expectExit(0);

  checkPackages(s,
                ["meteor-platform", "accounts-base",
                 "say-something@1.0.0", "depends-on-plugin"]);

  checkVersions(s,
                ["accounts-base",  "depends-on-plugin",
                 "say-something",  "meteor-platform",
                 "contains-plugin@1.1.0"]);

  run = s.run("remove", "say-something");
  run.match("Removed top-level dependency on say-something.");
  checkVersions(s,
                ["accounts-base",  "depends-on-plugin",
                 "meteor-platform",
                 "contains-plugin"]);

  run = s.run("remove", "depends-on-plugin");
  run.match("removed contains-plugin");
  run.match("removed depends-on-plugin");
  run.match("Removed top-level dependency on depends-on-plugin.");

  checkVersions(s,
                ["accounts-base",
                 "meteor-platform"]);
  run = s.run("list");
  run.match("accounts-base");
  run.match("meteor-platform");

  // Add packages to sub-programs of an app. Make sure that the correct change
  // is propagated to its versions file.
  s.cp('programs/empty/package2.js', 'programs/empty/package.js');

  // Don't add the file to packages.
  run = s.run("list");
  run.match("accounts-base");
  run.match("meteor-platform");

  // Do add the file to versions.
  checkVersions(s,
                ["accounts-base",  "depends-on-plugin",
                 "meteor-platform",
                 "contains-plugin"]);

  // Add a description-less package. Check that no weird things get
  // printed (like "added no-description: undefined").
  run = s.run("add", "no-description");
  run.match("no-description\n");
  run.expectEnd();
  run.expectExit(0);
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
    s.set("METEOR_TEST_TMP", files.mkdtemp());
    s.set("METEOR_OFFLINE_CATALOG", "t");

    var outerRun = s.run("add", "say-something-client-targets");
    outerRun.match("added");
    outerRun.expectExit(0);
    checkPackages(s,
                  ["meteor-platform", "say-something-client-targets"]);

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

// Removes the local data.json file from disk.
var cleanLocalCache = function () {
  var config = require("../config.js");
  var storage =  config.getPackageStorage();
  if (fs.existsSync(storage)) {
    fs.unlinkSync(storage);
  }
};

var publishMostBasicPackage = function (s, fullPackageName) {
  var run = s.run("create", "--package", fullPackageName);
  run.waitSecs(15);
  run.expectExit(0);
  run.match(fullPackageName);

  s.cd(fullPackageName, function () {
    run = s.run("publish", "--create");
    run.waitSecs(15);
    run.expectExit(0);
    run.match("Done");
  });
};

var publishReleaseInNewTrack = function (s, releaseTrack, tool, packages) {
  var relConf = {
    track: releaseTrack,
    version: "0.9",
    recommended: "true",
    description: "a test release",
    tool: tool + "@1.0.0",
    packages: packages
  };
  s.write("release.json", JSON.stringify(relConf, null, 2));
  var run = s.run("publish-release", "release.json", "--create-track");
  run.waitSecs(15);
  run.match("Done");
  run.expectExit(0);
};

// Add packages through the command line, and make sure that the correct set of
// changes is reflected in .meteor/packages, .meteor/versions and list
selftest.define("sync local catalog", ["slow", "net", "test-package-server"],  function () {
  var s = new Sandbox();
  var run;

  s.set("METEOR_TEST_TMP", files.mkdtemp());
  testUtils.login(s, username, password);
  var packageName = utils.randomToken();
  var fullPackageName = username + ":" + packageName + "-a";
  var releaseTrack = username + ":TEST-" + utils.randomToken().toUpperCase();

  // First test -- pretend that the user has downloaded meteor for the purpose
  // of running a package or an app. Create a package. Clean out the
  // data.json, then try to do things with them.

  publishMostBasicPackage(s, fullPackageName);

  // Publish a release.  This release is super-fake: the tool is a package that
  // is not actually a tool, for example. That's OK for our purposes for now,
  // because we only care about the tool version if we run an app from it.
  var packages = {};
  packages[fullPackageName] = "1.0.0";
  publishReleaseInNewTrack(s, releaseTrack, fullPackageName /*tool*/, packages);

  // Create a package that has a versionsFrom for the just-published release.
  var newPack = username + ":" + packageName + "-b";
  s.createPackage(newPack, "package-of-two-versions");
  s.cd(newPack, function() {
    var packOpen = s.read("package.js");
    packOpen = packOpen + "\nPackage.onUse(function(api) { \n" +
      "api.versionsFrom(\"" + releaseTrack + "@0.9\");\n" +
      "api.use(\"" + fullPackageName + "\"); });";
    s.write("package.js", packOpen);
  });

  // Clear the local data cache by deleting the data.json file that we are
  // reading our package data from. We now have no data about server contents,
  // including the release that we just published, so we have to sync to the
  // server to get that information.
  cleanLocalCache();

  // Try to publish the package. Since the package references the release that
  // we just published, it needs to resync with the server in order to be able
  // to compile itself.
  s.cd(newPack, function() {
    run = s.run("publish", "--create");
    run.waitSecs(20);
    run.match("Done");
    run.expectExit(0);
  });

  // Part 2.
  // Make an app. It is basically an app.
  cleanLocalCache();
  run = s.run("create", "testApp");
  run.waitSecs(10);
  run.expectExit(0);

  // Remove data.json again.
  cleanLocalCache();

  // Add our newly-created package to the app. That package only exists on the
  // server, so we need to sync to get it.
  s.cd("testApp", function () {
    run = s.run("add", newPack);
    run.waitSecs(5);
    var match1 = run.match(/  added .*-([ab]) at version 1.0.0/);
    var match2 = run.match(/  added .*-([ab]) at version 1.0.0/);
    // the lines should be different:
    selftest.expectEqual(match1[1] !== match2[1], true);
    run.match("Test package");
    run.expectExit(0);

    // Run the app!
    run = s.run();
    run.waitSecs(15);
    run.match("running at");
    run.match("localhost");
    run.stop();

    // Remove data.json; run again! Make sure that we sync, because we are using
    // a package that we don't know about. This is a pretty good imitation of
    // the following workflow: you check out your friend's app from github, then
    // run your newly installed meteor. So, clearly, it should not fail.
    cleanLocalCache();
    run = s.run();
    run.waitSecs(15);
    run.match("running at");
    run.match("localhost");
    run.stop();
  });

});

// `packageName` should be a full package name (i.e. <username>:<package
// name>), and the sandbox should be logged in as that username.
var createAndPublishPackage = function (s, packageName) {
  var run = s.run("create", "--package", packageName);
  run.waitSecs(10);
  run.expectExit(0);
  s.cd(packageName, function (){
    run = s.run("publish", "--create");
    run.waitSecs(25);
    run.expectExit(0);
  });
};

selftest.define("release track defaults to METEOR",
                ["net", "test-package-server", "checkout"], function () {
  var s = new Sandbox();
  s.set("METEOR_TEST_TMP", files.mkdtemp());
  testUtils.login(s, username, password);
  var packageName = utils.randomToken();
  var fullPackageName = username + ":" + packageName;
  var releaseVersion = utils.randomToken();

  // Create a package that has a versionsFrom for the just-published
  // release, but without the release track present in the call to
  // `versionsFrom`. This implies that it should be prefixed
  // by "METEOR@"
  var newPack = fullPackageName;
  s.createPackage(newPack, "package-of-two-versions");
  s.cd(newPack, function() {
    var packOpen = s.read("package.js");
    packOpen = packOpen + "\nPackage.onUse(function(api) { \n" +
      "api.versionsFrom(\"" + releaseVersion + "\");\n" +
      "api.use(\"" + fullPackageName + "\"); });";
    s.write("package.js", packOpen);
  });

  // Try to publish the package. The error message should demonstrate
  // that we indeed default to the METEOR release track when not
  // specified.
  s.cd(newPack, function() {
    var run = s.run("publish", "--create");
    run.waitSecs(20);
    run.matchErr("Unknown release METEOR@" + releaseVersion);
    run.expectExit(1);
  });
});

//
// THIS TEST RELIES ON THE TEST SERVER HAVING THE SAME RELEASE AS THE PRODUCTION
// SERVER. YOU *CAN* RUN IT FROM RELEASE IFF YOU PUBLISH A CORRESPONDING RELEASE
// TO THE TEST SERVER. (XXX: fix this post-0.9.0)
selftest.define("update server package data unit test",
                ["net", "test-package-server", "checkout"], function () {
  var packageStorageFileDir = files.mkdtemp("update-server-package-data");
  var packageStorageFile = path.join(packageStorageFileDir, "data.json");

  var s = new Sandbox();
  var run;

  testUtils.login(s, username, password);

  // Get the current data from the server. Once we publish new packages,
  // we'll check that all this data still appears on disk and hasn't
  // been overwritten.
  var data = packageClient.updateServerPackageData({ syncToken: {} }, {
    packageStorageFile: packageStorageFile,
    packageServerUrl: selftest.testPackageServerUrl
  }).data;

  var packageNames = [];

  // Publish more than a (small) page worth of packages. When we pass the
  // `useShortPages` option to updateServerPackageData, the server will send 3
  // records at a time instead of 100, so this is more than a page.
  _.times(5, function (i) {
    var packageName = username + ":" + utils.randomToken();
    createAndPublishPackage(s, packageName);
    packageNames.push(packageName);
  });

  var newData = packageClient.updateServerPackageData(data, {
    packageStorageFile: packageStorageFile,
    packageServerUrl: selftest.testPackageServerUrl,
    useShortPages: true
  }).data;
  var newOnDiskData = packageClient.loadCachedServerData(packageStorageFile);

  // Check that we didn't lose any data.
  _.each(data.collections, function (collectionData, name) {
    _.each(collectionData, function (record, i) {
      selftest.expectEqual(newData.collections[name][i], record);

      var onDisk = newOnDiskData.collections[name][i];

      // XXX Probably because we're using JSON.parse/stringify instead
      // of EJSON to serialize/deserialize to disk, we can't compare
      // records with date fields using `selftest.expectEqual`.
      _.each(
        ["lastUpdated", "published", "buildPublished"],
        function (dateFieldName) {
          if (record[dateFieldName]) {
            selftest.expectEqual(new Date(onDisk[dateFieldName]),
                                 new Date(record[dateFieldName]));
          } else {
            selftest.expectEqual(onDisk[dateFieldName], record[dateFieldName]);
          }

          delete onDisk[dateFieldName];
          delete record[dateFieldName];
        }
      );

      selftest.expectEqual(onDisk, record);
    });
  });

  // Check that our newly published packages appear in newData and on disk.
  _.each(packageNames, function (name) {
    var found = _.findWhere(newData.collections.packages, { name: name });
    selftest.expectEqual(!! found, true);
    var foundOnDisk = _.findWhere(newOnDiskData.collections.packages,
                                  { name: name });
    selftest.expectEqual(!! foundOnDisk, true);
  });
});


// Add packages to an app. Change the contents of the packages and their
// dependencies, make sure that the app still refreshes.
selftest.define("package with --name", ['test-package-server'], function () {
  var s = new Sandbox();
  var run;

  // Starting a run; introducing a new package overriding a core package.
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.mkdtemp());
  run = s.run("add", "accounts-base");
  run.waitSecs(15);
  run.match("accounts-base");

  run = s.run();
  run.waitSecs(5);
  run.match("myapp");
  run.match("proxy");
  run.match("MongoDB.\n");
  run.waitSecs(5);
  run.read("=> Starting your app");
  run.waitSecs(5);
  run.match("running at");
  run.match("localhost");

  s.cd("packages", function () {
    s.createPackage("ac-fake", "fake-accounts-base");
  });

  run.waitSecs(5);
  run.match("overriding accounts-base!");
  run.match("restarted");
  run.stop();

  run = s.run('list');
  run.match("accounts-base");
  run.match("meteor");

  // What about test-packages?
  s.cd('packages');
  s.cd('ac-fake');
  run = s.run('test-packages', './');
  run.waitSecs(15);
  run.match("overriding accounts-base!");
  run.stop();
});

selftest.define("talk to package server with expired or no accounts token", ['net', 'test-package-server'], function () {
  var s = new Sandbox();
  testUtils.login(s, "test", "testtest");

  // Revoke our credential by logging out.
  var session = s.readSessionFile();
  testUtils.logout(s);

  testUtils.login(s, "testtest", "testtest");
  var packageName = "testtest:" + utils.randomToken();
  publishMostBasicPackage(s, packageName);
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
  // meteor-platform. So this command should fail.
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
  var version = packageJs.match(/version: \"(\d\.\d\.\d)\"/)[1];
  var versionParts = version.split(".");
  versionParts[0] = parseInt(versionParts[0]) + 1;
  packageJs = packageJs.replace(version, versionParts.join("."));
  s.write("package.js", packageJs);

  var run = s.run("publish");
  run.waitSecs(30);
  if (expectAuthorizationFailure) {
    run.matchErr("not an authorized maintainer");
    // XXX Why is this 3? Other unauthorized errors (e.g. maintainers
    // --add when you are not a maintainer) exit 1
    run.expectExit(3);
  } else {
    run.match("Done");
    run.expectExit(0);
  }
};

selftest.define("packages with organizations", ["net", "test-package-server"], function () {
  var s = new Sandbox();
  testUtils.login(s, "test", "testtest");

  var orgName = testUtils.createOrganization("test", "testtest");

  // Publish a package with 'orgName' as the prefix.
  var packageName = utils.randomToken();
  var fullPackageName = orgName + ":" + packageName;
  publishMostBasicPackage(s, fullPackageName);
  s.cd(fullPackageName);

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
  run.matchErr("remove the maintainer in the package prefix");
  run.expectExit(1);

  // Publish a package with 'test' as the prefix.
  s.cd("..");
  testUtils.login(s, "test", "testtest");
  fullPackageName = "test:" + utils.randomToken();
  publishMostBasicPackage(s, fullPackageName);
  s.cd(fullPackageName);

  // Add 'orgName' as a maintainer.
  run = s.run("admin", "maintainers", fullPackageName, "--add", orgName);
  run.waitSecs(15);
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
