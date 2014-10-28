var _ = require('underscore');

var utils = require('../utils.js');
var testUtils = require('../test-utils.js');
var selftest = require('../selftest.js');
var stats = require('../stats.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');

selftest.define("publish-and-search",
    ["slow", "net", "test-package-server", "checkout"], function () {
  var s = new Sandbox;

  var username = "test";
  var password = "testtest";

  testUtils.login(s, username, password);
  var packageName = utils.randomToken();
  var fullPackageName = username + ":" + packageName;
  var githubUrl = "http://github.com/foo/bar";

  // Create a package that has a versionsFrom for a nonexistent release and see
  // that we throw on it.
  var noPack = fullPackageName + "2";
  s.createPackage(noPack, "package-of-two-versions");
  s.cd(noPack, function() {
    var packOpen = s.read("package.js");
    packOpen = packOpen + "\nPackage.onUse(function(api) { \n" +
      "api.versionsFrom(\"THIS-RELEASE-DOES-NOT-EXIST@0.9\");\n" +
      " });";
    s.write("package.js", packOpen);
    run = s.run("publish", "--create");
    run.waitSecs(20);
    run.matchErr("Unknown release");
  });

  // Now create a real package.
  var run = s.run("create", "--package", fullPackageName);
  run.waitSecs(15);
  run.expectExit(0);
  run.match(fullPackageName);

  s.cd(fullPackageName);

  // set a github URL in the package
  var packageJsContents = s.read("package.js");
  var newPackageJsContents = packageJsContents.replace(
      /git: \'.*\'/, "git: \'" + githubUrl + "\'");
  s.write("package.js", newPackageJsContents);

  run = s.run("publish");
  run.waitSecs(15);
  run.expectExit(1);
  run.matchErr("Publish failed"); // need to pass --create

  run = s.run("publish", "--create");
  run.waitSecs(15);
  run.expectExit(0);
  run.match("Done");

  run = s.run("search", packageName);
  run.waitSecs(15);
  run.expectExit(0);
  run.match(fullPackageName);

  run = s.run("show", fullPackageName);
  run.waitSecs(15);
  run.expectExit(0);
  run.match("Maintained");
  run.match(githubUrl);

  // name override.
  packageName = utils.randomToken();
  var newPackageName = username + ":" + packageName;
  var minPack = " Package.describe({ " +
    "summary: 'Test package: " + packageName + "'," +
    "version: '1.0.1'," +
    "name: '" + newPackageName + "'});";

  s.createPackage(fullPackageName, "package-of-two-versions");
  s.cd(fullPackageName, function() {
    s.write("package.js", minPack);
    // If we manage to publish without the --create flag, that's probably an
    // indicator that we are reading the directory instead of the override, or,
    // in any case, that we can't rely on the rest of this test working.
    run = s.run("publish");
    run.waitSecs(15);
    run.match("Reading package...\n");
    run.matchErr("There is no package named " + newPackageName);
    run.expectExit(1);

    // Might a well actually publish it.
    run = s.run("publish", "--create");
    run.waitSecs(30);
    run.expectExit(0);
    run.match("Done");
  });

  run = s.run("show", newPackageName);
  run.waitSecs(15);
  run.expectExit(0);
  run.match("package: " + packageName);
});

selftest.define("publish-one-arch",
    ["slow", "net", "test-package-server", "checkout"], function () {
  var s = new Sandbox;

  var username = "test";
  var password = "testtest";

  testUtils.login(s, username, password);
  var packageName = utils.randomToken();
  var fullPackageName = username + ":" + packageName;

  var run = s.run("create", "--package", fullPackageName);
  run.waitSecs(15);
  run.expectExit(0);
  run.match(fullPackageName);

  s.cd(fullPackageName);

  run = s.run("publish", "--create");
  run.waitSecs(15);
  run.expectExit(0);
  run.match("Done");
  run.forbidAll("WARNING");

  packageName = utils.randomToken();
  fullPackageName = username + ":" + packageName;

  s.createPackage(fullPackageName, "package-with-npm");
  s.cd(fullPackageName);

  run = s.run("publish", "--create");
  run.waitSecs(15);
  run.expectExit(0);
  run.matchErr(
"This package contains binary code and must be built on multiple architectures.");

});

selftest.define("list-with-a-new-version",
    ["slow", "net", "test-package-server", "checkout"],
    function () {
  var s = new Sandbox;

  var username = "test";
  var password = "testtest";

  testUtils.login(s, username, password);
  var packageName = utils.randomToken();
  var fullPackageName = username + ":" + packageName;
  var run;

  // Now, create a package.
  s.createPackage(fullPackageName, "package-of-two-versions");
  // Publish the first version.
  s.cd(fullPackageName, function () {
    run = s.run("publish", "--create");
    run.waitSecs(15);
    run.expectExit(0);
    run.match("Done");
  });

  // Create an app. Add the package to it. Check that list shows the package and
  // does not show the new versions available message.
  run = s.run('create', 'mapp');
  run.waitSecs(15);
  run.expectExit(0);
  s.cd('mapp', function () {
    run = s.run("add", fullPackageName);
    run.waitSecs(100);
    run.expectExit(0);
    run = s.run("list");
    run.waitSecs(10);
    run.match(fullPackageName);
    run.match("1.0.0 ");
    run.forbidAll("New versions");
    run.expectExit(0);
  });

  // Change the package to increment version and publish the new package.
  s.cp(fullPackageName+'/package2.js', fullPackageName+'/package.js');
  s.cd(fullPackageName, function () {
    run = s.run("publish");
    run.waitSecs(15);
    run.expectExit(0);
    run.match("Done");
  });

  // cd into the app and run list again. We should get some sort of message.
  s.cd('mapp', function () {
    run = s.run("list");
    run.match(fullPackageName);
    run.match("1.0.0*");
    run.match("New versions");
    run.match("meteor update");
    run.expectExit(0);

    // Switch to the other version.
    run = s.run("add", fullPackageName + "@1.0.1");
    run.waitSecs(100);
    run.expectExit(0);
    run = s.run("list");
    run.waitSecs(10);
    run.match(fullPackageName);
    run.match("1.0.1 ");
    run.forbidAll("New versions");
    run.expectExit(0);

    // Switch back to the first version.
    run = s.run("add", fullPackageName + "@=1.0.0");
    run.waitSecs(100);
    run.expectExit(0);
    run = s.run("list");
    run.waitSecs(10);
    run.match(fullPackageName);
    run.match("1.0.0*");
    run.match("New versions");
    run.match("meteor update");
    run.expectExit(0);

    // ... and back to the second version
    run = s.run("add", fullPackageName + "@=1.0.1");
    run.waitSecs(100);
    run.expectExit(0);
    run = s.run("list");
    run.waitSecs(10);
    run.match(fullPackageName);
    run.match("1.0.1 ");
    run.forbidAll("New versions");
    run.expectExit(0);
  });

  // Now publish an 1.0.4-rc4.
  s.cp(fullPackageName+'/packagerc.js', fullPackageName+'/package.js');
  s.cd(fullPackageName, function () {
    run = s.run("publish");
    run.waitSecs(15);
    run.expectExit(0);
    run.match("Done");
  });

  s.cd('mapp', function () {
    // //
    // run = s.run("search", "asdf");
    // run.waitSecs(100);
    // run.expectExit(0);

    // Because it's an RC, we shouldn't see an update message.
    run = s.run("list");
    run.waitSecs(10);
    run.match(fullPackageName);
    run.match("1.0.1 ");
    run.forbidAll("New versions");
    run.expectExit(0);

    // It works if ask for it, though.
    run = s.run("add", fullPackageName + "@1.0.4-rc.3");
    run.waitSecs(100);
    run.expectExit(0);
    run = s.run("list");
    run.waitSecs(10);
    run.match(fullPackageName);
    run.match("1.0.4-rc.3 ");
    run.forbidAll("New versions");
    run.expectExit(0);
  });
});


// Test that we only try to upgrade to pre-release versions of
// packages (eg 0.0.1-rc, 0.0.2-pre, ...) if there is at least one
// package already on a pre-release verison. That is -- adding a
// single pre-release version of a package is opting into "try to find
// use pre-release versions of any package if necessary"
selftest.define("do-not-update-to-rcs",
    ["slow", "net", "test-package-server", "checkout"],
    function () {

  // This test needs to run with a stub warehouse, since otherwise we
  // might find outselves running while a Meteor release is being
  // prepared, in which case we already have some packages in
  // pre-release version.
  var s = new Sandbox({warehouse: {
    "v1": {recommended: true}
  }});

  // This makes packages not depend on meteor (specifically, makes our empty
  // control program not depend on meteor).
  s.set("NO_METEOR_PACKAGE", "t");

  var username = "test";
  var password = "testtest";

  testUtils.login(s, username, password);
  var packageName = utils.randomToken();
  var fullPackageName = username + ":" + packageName;
  var run;

  // Now, create a package.
  s.createPackage(fullPackageName, "package-of-two-versions");
  // Publish the first version.
  s.cd(fullPackageName, function () {
    run = s.run("publish", "--create");
    run.waitSecs(120);
    run.expectExit(0);
    run.match("Done");
  });

  // Change the package to increment version and publish the new package.
  s.cp(fullPackageName+'/package2.js', fullPackageName+'/package.js');
  s.cd(fullPackageName, function () {
    run = s.run("publish");
    run.waitSecs(15);
    run.expectExit(0);
    run.match("Done");
  });

  // Now publish an 1.0.4-rc.3.
  s.cp(fullPackageName+'/packagerc.js', fullPackageName+'/package.js');
  s.cd(fullPackageName, function () {
    run = s.run("publish");
    run.waitSecs(15);
    run.expectExit(0);
    run.match("Done");
  });

  // Create an app. Add the package to it. Check that list shows the package, at
  // the non-rc version.
  run = s.run('create', 'mapp');
  run.waitSecs(15);
  run.expectExit(0);
  s.cd('mapp', function () {

    // XXX: This test was failing because we were running from a situation that
    // could not be resolved without using RCs. Since we had to use RCs already,
    // we were OK with using the RC for the new package. That's bad! Anyway, at
    // least we are testing that in the absense of other data, we should not add
    // the RC. Ideally, we should consider running this test with a warehouse,
    // but maybe not yet.
    run = s.run("remove", "meteor-platform", "autopublish", "insecure");
    run.waitSecs(10);
    run.expectExit(0);

    run = s.run("add", fullPackageName);
    run.waitSecs(10);
    run.expectExit(0);
    run = s.run("list");
    run.waitSecs(10);
    run.match(fullPackageName);
    run.match("1.0.1");
    run.forbidAll("New versions");
    run.expectExit(0);

    // Now, let's try to update. It should not work, since update will not bring
    // you to an rc version automatically (unless it has to).
    run = s.run("update", "packages-only");
    run.waitSecs(10);
    run.match("Your packages are at their latest compatible versions.");
    run.expectExit(0);
    run = s.run("update");
    run.waitSecs(10);
    run.match("Your packages are at their latest compatible versions.");
    run.expectExit(0);
    run = s.run("list");
    run.waitSecs(10);
    run.match(fullPackageName);
    // Check that we have 1.0.1 AND there is no star indicating new versions.
    run.match("1.0.1 ");
    run.expectExit(0);

    // It works if ask for it, though.
    run = s.run("add", fullPackageName + "@1.0.4-rc.3");
    run.waitSecs(100);
    run.expectExit(0);
    run = s.run("list");
    run.waitSecs(10);
    run.match(fullPackageName);
    run.match("1.0.4-rc.3"); // We got the rc version.
  });

  // Now publish an 1.0.4-rc.4.
  s.cp(fullPackageName+'/packagerc2.js', fullPackageName+'/package.js');
  s.cd(fullPackageName, function () {
    run = s.run("publish");
    run.waitSecs(15);
    run.expectExit(0);
    run.match("Done");
  });

  s.cd('mapp', function () {
    // If we run list, we see that we might want to upgrade.
    run = s.run("list");
    run.waitSecs(10);
    run.match(fullPackageName);
    run.match("1.0.4-rc.3");
    run.match("New versions");
    run.expectExit(0);

    // And if we run update, we will get the new rc.
    run = s.run("update", "--packages-only");
    run.waitSecs(10);
    run.match("1.0.4-rc.4");
    run.expectExit(0);
  });
});


selftest.define("package-depends-on-either-version",
    ["slow", "net", "test-package-server", "checkout"], function () {
  var s = new Sandbox;

  var username = "test";
  var password = "testtest";
  testUtils.login(s, username, password);
  var packageNameDependent = utils.randomToken();
  var run;

  // First, we publish fullPackageNameDep at 1.0 and publish it..
  var fullPackageNameDep = username + ":" + packageNameDependent;
  s.createPackage(fullPackageNameDep, "package-of-two-versions");
   s.cd(fullPackageNameDep, function() {
    run = s.run("publish", "--create");
    run.waitSecs(20);
    run.match("Done");
  });

  // Then, we publish fullPackageNameDep at 2.0.
  s.cd(fullPackageNameDep, function() {
    s.cp("package3.js", "package.js");
    run = s.run("publish");
    run.waitSecs(20);
    run.match("Done");
  });

  // Then, we make another one that depends on either version and publish.
  var another = utils.randomToken();
  var fullPackageAnother = username + ":" + another;
  s.createPackage(fullPackageAnother, "package-of-two-versions");
  s.cd(fullPackageAnother, function() {
    var packOpen = s.read("package.js");
   packOpen = packOpen + "\nPackage.onUse(function(api) { \n" +
      "api.use(\"" + fullPackageNameDep +
      "@1.0.0 || 2.0.0\");\n" +
      " });";
    s.write("package.js", packOpen);
    run = s.run("publish", "--create");
    run.waitSecs(20);
    run.match("Done");
  });

  // Now we add them to an app.
  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.mkdtemp());

  run = s.run("add", fullPackageNameDep + "@=1.0.0");
  run.match(fullPackageNameDep);
  run.expectExit(0);

  var readVersions = function () {
    var lines = s.read(".meteor/versions").split("\n");
    var depend = {};
    _.each(lines, function(line) {
      if (!line) return;
      // Packages are stored of the form foo@1.0.0, so this should give us an
      // array [foo, 1.0.0].
      var split = line.split('@');
      var pack = split[0];
      depend[pack] = split[1];
    });
    return depend;
  };

  var depend = readVersions();
  selftest.expectEqual(depend[fullPackageNameDep], "1.0.0");

  run = s.run("add", fullPackageAnother + "@=1.0.0");
  run.match(fullPackageAnother);
  run.expectExit(0);

  var depend = readVersions();
  selftest.expectEqual(depend[fullPackageNameDep], "1.0.0");
  selftest.expectEqual(depend[fullPackageAnother], "1.0.0");

  run = s.run("add", fullPackageNameDep + "@=2.0.0");
  run.match(fullPackageNameDep);
  run.expectExit(0);

  depend = readVersions();
  selftest.expectEqual(depend[fullPackageNameDep], "2.0.0");
  selftest.expectEqual(depend[fullPackageAnother], "1.0.0");
});
