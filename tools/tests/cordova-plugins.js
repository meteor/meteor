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


var localCordova = path.join(files.getCurrentToolsDir(), "tools",
  "cordova-scripts", "cordova.sh");
// Given a sandbox, that has the app as its currend cwd, read the versions file
// and check that it contains the plugins that we are looking for. We don't
// check the order, we just want to make sure that the right dependencies are
// in.
//
// sand: a sandbox, that has the main app directory as its cwd.
// plugins: an array of plugins in order.
var checkCordovaPlugins = selftest.markStack(function(sand, plugins) {
  var lines = selftest.execFileSync(localCordova, ['plugins'],
    {
      cwd: path.join(sand.cwd, '.meteor', 'local', 'cordova-build'),
      env: {
        METEOR_WAREHOUSE_DIR: sand.warehouse
      }
    }).split("\n");
  if (lines[0].match(/No plugins/)) {
    lines = [];
  }

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
});

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
  s.write(".meteor/packages", "meteor-platform \n contains-cordova-plugin");
  run.waitSecs(2);
  run.match("restarted");

  // Change something in the plugin.
  s.cp('packages/contains-cordova-plugin/package2.js', 'packages/contains-cordova-plugin/package.js');
  run.waitSecs(2);
  run.match("restarted");

  s.cp('packages/contains-cordova-plugin/package3.js', 'packages/contains-cordova-plugin/package.js');
  run.waitSecs(2);
  run.match("exact version");
});


// Add plugins through the command line, and make sure that the correct set of
// changes is reflected in .meteor/packages, .meteor/versions and list
selftest.define("add cordova plugins", ["slow"], function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.mkdtemp());
  s.set("METEOR_OFFLINE_CATALOG", "t");

  run = s.run("remove", "meteor-platform");
  run.match("removed");

  run = s.run("run", "android");
  run.matchErr("not added to the project");
  run.match("meteor add-platform ");

  run = s.run("add-platform", "android");
  run.match("Do you agree");
  run.write("Y\n");
  run.extraTime = 90; // Huge download
  run.match("added platform");

  run = s.run("add", "cordova:org.apache.cordova.camera@0.3.0");
  run.waitSecs(5);
  run.match("added cordova plugin org.apache.cordova.camera");

  run = s.run("add", "cordova:org.apache.cordova.file");
  run.matchErr("Must declare exact version");

  // The current behavior doesn't fail if a plugin is not in the registry until
  // build time.
  run = s.run("add", "cordova:foo@1.0.0");
  run.waitSecs(5);
  run.match("added cordova plugin foo");

  run = s.run("remove", "cordova:foo");
  run.waitSecs(5);
  run.match("removed cordova plugin foo");

  checkUserPlugins(s, ["org.apache.cordova.camera"]);

  run = s.run("add", "contains-cordova-plugin");
  run.match("added");

  checkUserPlugins(s, ["org.apache.cordova.camera"]);

  run = s.run("list");
  run.match("org.apache.cordova.camera");

  run = s.run("list-platforms");
  run.match("android");

  run = s.run("build", "../a", "--server", "localhost:3000");
  run.waitSecs(30);
  // This fails because the FB plugin does not compile without additional
  // configuration for android.
  run.expectExit(8);

  // When one plugin installation fails, we uninstall all the plugins
  // (legend has it that Cordova can get in a weird inconsistent state
  // if we don't do this).
  checkCordovaPlugins(s, []);

  // Remove a plugin
  run = s.run("remove", "contains-cordova-plugin");
  run.match("removed");

  run = s.run("build", "../a", "--server", "localhost:3000");
  run.waitSecs(60);
  run.expectExit(0);

  checkCordovaPlugins(s, ["org.apache.cordova.camera"]);

  run = s.run("remove", "cordova:org.apache.cordova.camera");
  run.match("removed");
  run.expectExit(0);

  run = s.run("build", "../a", "--server", "localhost:3000");
  run.waitSecs(60);
  run.expectExit(0);

  checkCordovaPlugins(s, []);

  run = s.run("add", "cordova:org.apache.cordova.device@0.2.11");
  run.match("added");
  run.expectExit(0);

  run = s.run("build", "../a", "--server", "localhost:3000");
  run.waitSecs(60);
  run.expectExit(0);
  checkCordovaPlugins(s, ["org.apache.cordova.device"]);
});

selftest.define("remove cordova plugins", function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  run = s.run("add", "cordova:org.apache.cordova.camera@0.3.0");
  run.waitSecs(5);
  run.expectExit(0);

  checkUserPlugins(s, ["org.apache.cordova.camera"]);

  // Removing a plugin that hasn't been added should say that it isn't
  // in this project.
  run = s.run("remove", "cordova:blahblah");
  run.matchErr("not in this project");
  run.forbidAll("removed");
  run.expectExit(0);

  run = s.run("remove", "cordova:blahblah",
              "cordova:org.apache.cordova.camera");
  run.waitSecs(5);
  run.matchErr("not in this project");
  run.match("removed");
  run.expectExit(0);
  checkUserPlugins(s, []);
});
