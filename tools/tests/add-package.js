var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');
var _= require('underscore');

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

// Add packages to an app. Change the contents of the packages and their
// dependencies, make sure that the app still refreshes.
selftest.define("change packages", function () {
  var s = new Sandbox({ fakeMongo: true });
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.mkdtemp());
  run = s.run();
  run.match("myapp");
  run.match("proxy");
  run.tellMongo(MONGO_LISTENING);
  run.match("MongoDB");
  run.match("your app");
  run.waitSecs(5);
  run.match("running at");
  run.match("localhost");

  // Add the local package 'say-something'. It should print a message.
  s.write(".meteor/packages", "standard-app-packages \n say-something");
  run.waitSecs(2);
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
  console.log("XXX: change something in plugin does not work");
/*  s.cd("packages/contains-plugin/plugin", function () {
    s.write("plugin.js", "console.log(\"edit\");");
  });
  run.waitSecs(2);
  run.match("edit");
  run.match("restarted"); */
});

// Look through the packages file and make sure that it contains the right
// packages, in the right order.
var checkPackages = function(sand, packages) {
  var lines = sand.read(".meteor/packages").split("\n");
  var i = 0;
  _.each(lines, function(line) {
    if (!line) return;
    var pack = line.split('@')[0];
    selftest.expectEqual(pack, packages[i]);
    i++;
  });
  selftest.expectEqual(packages.length, i);
};

// Look through the versions file and make sure that the right packages are
// included in the versions file.
var checkVersions = function(sand, packages) {
  var lines = sand.read(".meteor/versions").split("\n");
  var depend = {};
  _.each(lines, function(line) {
    if (!line) return;
    var pack = line.split('@')[0];
    depend[pack] = true;
  });
  var i = 0;
  _.each(packages, function (pack) {
    selftest.expectEqual(depend[pack], true);
    i++;
  });
  selftest.expectEqual(packages.length, i);
};

// Add packages through the command line, and make sure that the changes are
// reflected where approporiate.
selftest.define("add packages", function () {
  var s = new Sandbox({ fakeMongo: true });
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.mkdtemp());

  run = s.run("add", "accounts-base");
  run.match("Successfully added");
  checkPackages(s,
                ["accounts-base", "standard-app-packages"]);

  run = s.run("--once");

  run = s.run("add", "say-something");
  run.match("Successfully added");
  checkPackages(s,
                ["accounts-base",  "say-something", "standard-app-packages"]);

  run = s.run("add", "depends-on-plugin");
  run.match("Successfully added");
  checkPackages(s,
                ["accounts-base",  "depends-on-plugin",
                 "say-something",  "standard-app-packages"]);

  checkVersions(s,
                ["accounts-base",  "depends-on-plugin",
                 "say-something",  "standard-app-packages",
                 "contains-plugin"]);

  run = s.run("remove", "say-something");
  run.match("Removed say-something");
  checkVersions(s,
                ["accounts-base",  "depends-on-plugin",
                 "standard-app-packages",
                 "contains-plugin"]);


  run = s.run("remove", "depends-on-plugin");
  run.match("removed dependency on contains-plugin");
  run.match("Removed depends-on-plugin");

  checkVersions(s,
                ["accounts-base",
                 "standard-app-packages"]);

  run = s.run("list", "--using");
  run.match("accounts-base");
  run.match("standard-app-packages");
});
