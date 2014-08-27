var _ = require('underscore');

var utils = require('../utils.js');
var testUtils = require('../test-utils.js');
var selftest = require('../selftest.js');
var stats = require('../stats.js');
var Sandbox = selftest.Sandbox;

selftest.define("publish-and-search", ["slow", "net", "test-package-server"], function () {
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
      /git: \".*\"/, "git: \"" + githubUrl + "\"");
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

selftest.define("publish-one-arch", ["slow", "net", "test-package-server"], function () {
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
  run.match("Done");
  run.match("WARNING");

});


selftest.define("list-with-a-new-version",
                ["slow", "net", "test-package-server"], function () {
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
    run.match("1.0.0");
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
    run.match("1.0.1");
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
  });

});
