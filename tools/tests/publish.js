var _ = require('underscore');
var utils = require('../utils/utils.js');
var testUtils = require('../tool-testing/test-utils.js');
var selftest = require('../tool-testing/selftest.js');
var stats = require('../meteor-services/stats.js');
var Sandbox = selftest.Sandbox;
var files = require('../fs/files.js');

selftest.define("create-publish-and-search",
    ["slow", "net", "test-package-server", "checkout"], function () {
  var s = new Sandbox;

  var username = "test";
  var password = "testtest";

  testUtils.login(s, username, password);
  var packageName = utils.randomToken();
  var fullPackageName = username + ":" + packageName;
  var fsPackageName = packageName;
  var githubUrl = "http://github.com/foo/bar";
  var summary = "Package for test";

  // Create a package that has a versionsFrom for a nonexistent release and see
  // that we throw on it.
  var noPack = fullPackageName + "2";
  var noPackDirName = fsPackageName + "2";
  s.createPackage(noPackDirName, noPack, "package-of-two-versions");
  s.cd(noPackDirName, function() {
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

  s.cd(fsPackageName);

  // set a github URL & summary in the package
  var packageJsContents = s.read("package.js");
  var newPackageJsContents = packageJsContents.replace(
      /git: \'.*\'/, "git: \'" + githubUrl + "\'");
  newPackageJsContents = newPackageJsContents.replace(
      /summary: \'.*\'/, "summary: \'" + summary + "\'");
  s.write("package.js", newPackageJsContents);

  // Write some documentation.
  s.write("README.md", "Heading\n==\nDocs here");

  run = s.run("publish");
  run.waitSecs(15);
  run.matchErr("There is no package named"); // need to pass --create
  run.expectExit(1);

  run = s.run("publish", "--create");
  run.waitSecs(30);
  run.match("Published");
  run.expectExit(0);

  run = s.run("search", packageName);
  run.waitSecs(15);
  run.expectExit(0);
  run.match(fullPackageName);

  run = s.run("show", fullPackageName);
  run.waitSecs(15);
  run.expectExit(0);
  run.match("Git");
  run.match(githubUrl);

  // name override.
  packageName = utils.randomToken();
  var newPackageName = username + ":" + packageName;
  var newPackageDirName = packageName;
  var minPack = " Package.describe({ " +
    "summary: 'Test package: " + packageName + "'," +
    "version: '1.0.1'," +
    "documentation: null," +
    "name: '" + newPackageName + "'});";

  s.createPackage(newPackageDirName, newPackageName, "package-of-two-versions");
  s.cd(newPackageDirName, function() {
    s.write("package.js", minPack);
    // If we manage to publish without the --create flag, that's probably an
    // indicator that we are reading the directory instead of the override, or,
    // in any case, that we can't rely on the rest of this test working.
    run = s.run("publish");
    run.waitSecs(15);
    run.matchErr("There is no package named " + newPackageName);
    run.expectExit(1);

    // Might a well actually publish it.
    run = s.run("publish", "--create");
    run.waitSecs(30);
    run.expectExit(0);
    run.match("Published");
  });

  run = s.run("show", newPackageName);
  run.waitSecs(15);
  run.expectExit(0);
  run.match("Package: " + newPackageName);
});

selftest.define("publish-one-arch",
    ["slow", "net", "test-package-server", "checkout"], function () {
  var s = new Sandbox;

  var username = "test";
  var password = "testtest";

  testUtils.login(s, username, password);
  var packageName = utils.randomToken();
  var fullPackageName = username + ":" + packageName;
  var newPackageDirName = packageName;

  s.createPackage(newPackageDirName, fullPackageName,
    "package-of-two-versions");
  s.cd(newPackageDirName);

  var run = s.run("publish", "--create");
  run.waitSecs(15);
  run.expectExit(0);
  run.match("Published");
  run.forbidAll("WARNING");

  packageName = utils.randomToken();
  fullPackageName = username + ":" + packageName;

  s.createPackage(packageName, fullPackageName, "package-with-npm");
  s.cd(packageName);

  run = s.run("publish", "--create");
  run.waitSecs(15);
  run.expectExit(0);
  run.matchErr("This package contains binary code and must be");

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
  s.createPackage(packageName, fullPackageName, "package-of-two-versions");
  // Publish the first version.
  s.cd(packageName, function () {
    run = s.run("publish", "--create");
    run.waitSecs(15);
    run.expectExit(0);
    run.match("Published");
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
  s.cd(packageName, function () {
    setPackageVersion(s, "1.0.1");
    run = s.run("publish");
    run.waitSecs(15);
    run.expectExit(0);
    run.match("Published");
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
  s.cd(packageName, function () {
    setPackageVersion(s, "1.0.4-rc.4");
    run = s.run("publish");
    run.waitSecs(15);
    run.expectExit(0);
    run.match("Published");
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
    run = s.run("add", fullPackageName + "@1.0.4-rc.4");
    run.waitSecs(100);
    run.expectExit(0);
    run = s.run("list");
    run.waitSecs(10);
    run.match(fullPackageName);
    run.match("1.0.4-rc.4 ");
    run.forbidAll("New versions");
    run.expectExit(0);
  });
});

// Sets the version on the multi-version package.
var setPackageVersion = function (sandbox, version) {
  var packOpen = sandbox.read("package-version.js");
  packOpen = packOpen.replace(/~version~/g, version);
  sandbox.write("package.js", packOpen);
};


selftest.define("package-depends-on-either-version",
    ["slow", "net", "test-package-server", "checkout"], function () {
  var s = new Sandbox;

  var username = "test";
  var password = "testtest";
  testUtils.login(s, username, password);
  var packageNameDependent = utils.randomToken();
  var run;

  // First, we publish fullPackageNameDep at 1.0.0 and publish it..
  var fullPackageNameDep = username + ":" + packageNameDependent;
  s.createPackage(packageNameDependent, fullPackageNameDep, "package-of-two-versions");
  s.cd(packageNameDependent, function() {
    run = s.run("publish", "--create");
    run.waitSecs(20);
    run.match("Published");
  });

  // Then, we publish fullPackageNameDep at 2.0.0
  s.cd(packageNameDependent, function() {
    setPackageVersion(s, "2.0.0");
    run = s.run("publish");
    run.waitSecs(20);
    run.match("Published");
  });

  // Then, we make another one that depends on either version and publish.
  var another = utils.randomToken();
  var fullPackageAnother = username + ":" + another;
  s.createPackage(another, fullPackageAnother, "package-of-two-versions");
  s.cd(another, function() {
    var packOpen = s.read("package.js");
   packOpen = packOpen + "\nPackage.onUse(function(api) { \n" +
      "api.use(\"" + fullPackageNameDep +
      "@1.0.0 || 2.0.0\");\n" +
      " });";
    s.write("package.js", packOpen);
    run = s.run("publish", "--create");
    run.waitSecs(20);
    run.match("Published");
  });

  // Now we add them to an app.
  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");

  run = s.run("add", fullPackageNameDep + "@=1.0.0");
  run.match(fullPackageNameDep);
  run.expectExit(0);

  var readVersions = function () {
    var lines = s.read(".meteor/versions").split("\n");
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
