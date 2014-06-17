var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');
var _= require('underscore');

// Copy the contents of one file to another.  In these series of tests, we often
// want to switch contents of package.js files. It is more legible to copy in
// the backup file rather than trying to write into it manually.
//
// XXX: Surely there is a function for this in fs?
// XXX: In which case, perhaps move this to sandbox.
var copyFile = function(from, to, sand) {
  var contents = sand.read(from);
  if (!contents) {
    throw new Error("File " + from + " does not exist.");
  };
  sand.write(to, contents);
};

// Given a sandbox, that has the app as its currend cwd, read the packages file
// and check that it contains exactly the packages specified, in order.
//
// sand: a sandbox, that has the main app directory as its cwd.
// packages: an array of packages in order. Packages can be of the form:
//
//    standard-app-packages (ie: name), in which case this will match any
//    version of that package as long as it is included.
//
//    awesome-pack@1.0.0+local (ie: name@version) to match that name at that
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
//    standard-app-packages (ie: name), in which case this will match any
//    version of that package as long as it is included. This is for packages
//    external to the app, since we don't want this test to fail when we push a
//    new version.
//
//    awesome-pack@1.0.0+local (ie: name@version) to match that name at that
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
selftest.define("change packages", function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.mkdtemp());
  run = s.run();
  run.match("myapp");
  run.match("proxy");
  run.match("MongoDB");
  run.waitSecs(5);
  run.match("your app");
  run.waitSecs(5);
  run.match("running at");
  run.match("localhost");
  // Add the local package 'say-something'. It should print a message.
  s.write(".meteor/packages", "standard-app-packages \n say-something");
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
  s.write(".meteor/packages", "standard-app-packages \n depends-on-plugin");
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

  // Add packages to sub-programs of an app. Make sure that the correct change
  // is propagated to its versions file.
  copyFile('programs/empty/package2.js', 'programs/empty/package.js', s);

  run.waitSecs(2);
  run.match("restarted");
});


// Add packages through the command line, and make sure that the correct set of
// changes is reflected in .meteor/packages, .meteor/versions and list
selftest.define("add packages", function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.mkdtemp());
  s.set("METEOR_OFFLINE_CATALOG", "t");

  run = s.run("add", "accounts-base");

  run.match("Successfully added");
  checkPackages(s,
                ["standard-app-packages", "accounts-base"]);

  run = s.run("--once");

  run = s.run("add", "say-something@1.0.0");
  run.match("Successfully added");

  checkPackages(s,
                ["standard-app-packages", "accounts-base",  "say-something@1.0.0"]);

  run = s.run("add", "depends-on-plugin");
  run.match("Successfully added");
  checkPackages(s,
                ["standard-app-packages", "accounts-base",
                 "say-something@1.0.0", "depends-on-plugin"]);

  checkVersions(s,
                ["accounts-base",  "depends-on-plugin",
                 "say-something",  "standard-app-packages",
                 "contains-plugin@1.1.0+local"]);

  run = s.run("remove", "say-something");
  run.match("Removed constraint say-something");
  checkVersions(s,
                ["accounts-base",  "depends-on-plugin",
                 "standard-app-packages",
                 "contains-plugin"]);

  run = s.run("remove", "depends-on-plugin");
  run.match("removed dependency on contains-plugin");
  run.match("Removed constraint depends-on-plugin");

  checkVersions(s,
                ["accounts-base",
                 "standard-app-packages"]);
  run = s.run("list");
  run.match("standard-app-packages");
  run.match("accounts-base");

  // Add packages to sub-programs of an app. Make sure that the correct change
  // is propagated to its versions file.
  copyFile('programs/empty/package2.js', 'programs/empty/package.js', s);

  // Don't add the file to packages.
  run = s.run("list");
  run.match("standard-app-packages");
  run.match("accounts-base");

  // Do add the file to versions.
  checkVersions(s,
                ["accounts-base",  "depends-on-plugin",
                 "standard-app-packages",
                 "contains-plugin"]);
});
