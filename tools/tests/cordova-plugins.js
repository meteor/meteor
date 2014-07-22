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


// Given a sandbox, that has the app as its currend cwd, read the versions file
// and check that it contains the plugins that we are looking for. We don't
// check the order, we just want to make sure that the right dependencies are
// in.
//
// sand: a sandbox, that has the main app directory as its cwd.
// plugins: an array of plugins in order.
var checkCordovaPlugins = function(sand, plugins) {
  var lines = sand.read(".meteor/local/cordova.client/cordova-all-plugins")
                  .split("\n");
  var i = 0;
  _.each(lines, function(line) {
    if (!line) return;
    // If the specified package contains an @ sign, then it has a version
    // number, so we should match everything.
    if (plugins[i].split('@').length > 1) {
      selftest.expectEqual(line, plugins[i]);
    } else {
      var pack = line.split('@')[0];
      selftest.expectEqual(pack, plugins[i]);
    }
    i++;
  });
  selftest.expectEqual(plugins.length, i);
};

// Given a sandbox, that has the app as its currend cwd, read the cordova plugins
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
selftest.define("change plugins", function () {
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

  // Add the local plugin 'say-something'. It should print a message.
  s.write(".meteor/cordova-plugins", "say-something");
  run.waitSecs(3);
  run.match("initial");
  run.match("restarted");

  // Add a local package contains-cordova-plugin.
  s.write(".meteor/packages", "standard-app-packages \n contains-cordova-plugin");
  run.waitSecs(2);
  run.match("restarted");

  // Change something in the plugin.
  s.cp('package2.js', 'package.js');
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

  run = s.run("cordova", "plugin", "add", "org.apache.cordova.camera");

  checkUserPlugins(s, ["org.apache.cordova.camera"]);

  run = s.run("add", "contains-cordova-plugin");
  run.match("Successfully added");
  // XXX message about a plugin?
  checkUserPlugins(s, ["org.apache.cordova.camera"]);

  run = s.run("cordova", "create", "ios"); // XXX remove ios

  checkCordovaPlugins(s,
    ["org.apache.cordova.camera@0.3.0",
     "https://github.com/shazron/phonegap-facebook-plugin.git"]);// XXX fix this

  run = s.run("remove", "contains-cordova-plugin");
  // XXX message here?

  run = s.run("cordova", "build"); // XXX remove ios
  checkCordovaPlugins(s,
    ["org.apache.cordova.camera",
     "https://github.com/shazron/phonegap-facebook-plugin.git"]);
});
