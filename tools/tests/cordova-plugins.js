var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');
var _ = require('underscore');
var utils = require('../utils.js');
var fs = require('fs');
var path = require('path');

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


// Given a sandbox, that has the app as its currend cwd, read the versions file
// and check that it contains the plugins that we are looking for. We don't
// check the order, we just want to make sure that the right dependencies are
// in.
//
// sand: a sandbox, that has the main app directory as its cwd.
// plugins: an array of plugins in order.
var checkCordovaPlugins = function(sand, plugins) {
  var lines = selftest.execFileSync('cordova', ['plugins'],
    { cwd: path.join(sand.cwd, '.meteor', 'local', 'cordova-build') }).split("\n");

  lines.sort();
  plugins = _.clone(plugins).sort();

  var i = 0;
  _.each(lines, function(line) {
    if (!line || line === '') return;
    // XXX should check for the version as well?
    selftest.expectEqual(line.split(' ')[0], plugins[i]);
    i++;
  });
  selftest.expectEqual(plugins.length, i);
};

// Given a sandbox, that has the app as its cwd, read the cordova plugins
// file and check that it contains exactly the plugins specified, in order.
//
// sand: a sandbox, that has the main app directory as its cwd.
// plugins: an array of plugins in order. Plugins can be of the form:
//
//    standard-app-plugins (ie: name), in which case this will match any
//    version of that plugin as long as it is included.
//
//    awesome-plugin@1.0.0 (ie: name@version) to match that name at that
//    version explicitly. This is for plugins that we included at a specific
//    version.
var checkUserPlugins = function(sand, plugins) {
  var lines = sand.read(".meteor/cordova-plugins").split("\n");
  var depend = {};
  _.each(lines, function(line) {
    if (!line) return;
    // plugins are stored of the form foo@1.0.0, so this should give us an
    // array [foo, 1.0.0].
    var split = line.split('@');
    var plugins = split[0];
    depend[plugins] = split[1];
  });
  var i = 0;
  _.each(plugins, function (plugins) {
    var split = plugins.split('@');
    if (split.length > 1) {
      selftest.expectEqual(depend[split[0]], split[1]);
    } else {
      var exists = _.has(depend, split[0]);
      selftest.expectEqual(exists, true);
    }
    i++;
  });
  selftest.expectEqual(plugins.length, i);
};

// Add plugins to an app. Change the contents of the plugins and their
// dependencies, make sure that the app still refreshes.
selftest.define("change cordova plugins", function () {
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

  // Add a local package contains-cordova-plugin.
  s.write(".meteor/packages", "standard-app-packages \n contains-cordova-plugin");
  run.waitSecs(2);
  run.match("restarted");

  // Change something in the plugin.
  s.cp('packages/contains-cordova-plugin/package2.js', 'packages/contains-cordova-plugin/package.js');
  run.waitSecs(2);
  run.match("restarted");

  s.cp('packages/contains-cordova-plugin/package3.js', 'packages/contains-cordova-plugin/package.js');
  run.waitSecs(2);
  run.matchErr("exact version");
});


// Add plugins through the command line, and make sure that the correct set of
// changes is reflected in .meteor/packages, .meteor/versions and list
selftest.define("add cordova plugins", function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.mkdtemp());
  s.set("METEOR_OFFLINE_CATALOG", "t");

  run = s.run("remove", "standard-app-packages");
  run.match("removed");

  run = s.run("run", "firefoxos");
  run.matchErr("not added to the project");
  run.matchErr("meteor add platform:");

  run = s.run("add", "platform:firefoxos");
  run.match("added platform");

  run = s.run("add", "cordova:org.apache.cordova.camera@0.3.0");
  run.match("added cordova plugin org.apache.cordova.camera");

  run = s.run("add", "cordova:org.apache.cordova.file");
  run.matchErr("Must declare exact version");

  checkUserPlugins(s, ["org.apache.cordova.camera"]);

  run = s.run("add", "contains-cordova-plugin");
  run.match("added");

  // XXX message about a plugin?
  checkUserPlugins(s, ["org.apache.cordova.camera"]);

  run = s.run("run", "firefoxos");
  run.waitSecs(20);

  checkCordovaPlugins(s,
    ["org.apache.cordova.camera",
     "com.phonegap.plugins.facebookconnect",
     "org.apache.cordova.file"]);

  // Remove a plugin
  run = s.run("remove", "contains-cordova-plugin");
  run.match("removed");

  checkCordovaPlugins(s, ["org.apache.cordova.camera"]);
});
