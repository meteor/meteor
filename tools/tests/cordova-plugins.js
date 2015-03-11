var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');
var _ = require('underscore');

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


var localCordova = files.pathJoin(files.getCurrentToolsDir(), "tools",
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
      cwd: files.pathJoin(sand.cwd, '.meteor', 'local', 'cordova-build'),
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
selftest.define("change cordova plugins", ["cordova"], function () {
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

  // Add a local package contains-cordova-plugin.
  s.write(".meteor/packages", "meteor-platform \n contains-cordova-plugin");
  run.waitSecs(2);
  run.match("restarted");

  // Change something in the plugin.
  s.cp('packages/contains-cordova-plugin/package2.js', 'packages/contains-cordova-plugin/package.js');
  run.waitSecs(2);
  run.match("restarted");

  // Introduce an error.
  s.cp('packages/contains-cordova-plugin/package3.js', 'packages/contains-cordova-plugin/package.js');
  run.waitSecs(2);
  run.match("exact version");

  // Fix the error.
  s.cp('packages/contains-cordova-plugin/package2.js', 'packages/contains-cordova-plugin/package.js');
  run.waitSecs(2);
  run.match("restarted");
});


// Add plugins through the command line, and make sure that the correct set of
// changes is reflected in .meteor/packages, .meteor/versions and list
selftest.define("add cordova plugins", ["slow", "cordova"], function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_OFFLINE_CATALOG", "t");

  run = s.run("remove", "meteor-platform");
  run.match("removed");

  run = s.run("run", "android");
  run.matchErr("Please add the Android platform to your project first");
  run.match("meteor add-platform ");

  run = s.run("add-platform", "android");
  run.waitSecs(2);
  run.match("Do you agree");
  run.write("Y\n");
  run.waitSecs(90); // Huge download
  run.match("added platform");

  run = s.run("add", "cordova:org.apache.cordova.camera@0.3.0");
  run.waitSecs(5);
  run.match("added cordova plugin org.apache.cordova.camera");
  run.expectExit(0);

  run = s.run("add", "cordova:org.apache.cordova.file");
  run.matchErr("exact version or tarball url");
  run.expectExit(1);

  // The current behavior doesn't fail if a plugin is not in the registry until
  // build time.
  run = s.run("add", "cordova:foo@1.0.0");
  run.waitSecs(5);
  run.match("added cordova plugin foo");
  run.expectExit(0);

  run = s.run("remove", "cordova:foo");
  run.waitSecs(5);
  run.match("removed cordova plugin foo");
  run.expectExit(0);

  checkUserPlugins(s, ["org.apache.cordova.camera"]);

  run = s.run("add", "contains-cordova-plugin");
  run.match("added,");
  run.match("contains a cordova plugin");
  run.expectExit(0);

  checkUserPlugins(s, ["org.apache.cordova.camera"]);

  run = s.run("list");
  run.match("org.apache.cordova.camera");

  run = s.run("list-platforms");
  run.match("android");

  run = s.run("build", "../a", "--server", "localhost:3000");
  run.waitSecs(30);
  // This fails because the FB plugin does not compile without additional
  // configuration for android.
  run.expectExit(1);

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
  run.expectExit(1);

  run = s.run("remove", "cordova:blahblah",
              "cordova:org.apache.cordova.camera");
  run.waitSecs(5);
  run.matchErr("not in this project");
  run.match("removed");
  run.expectExit(1);
  checkUserPlugins(s, []);
});

selftest.define("meteor exits when cordova platforms change", ["slow", "cordova"], function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "package-tests");
  s.cd("myapp");

  run = s.run();
  run.waitSecs(30);
  run.match("Started your app");

  // Add a platform via command line
  var platformRun = s.run("add-platform", "android");
  platformRun.match("Do you agree");
  platformRun.write("Y\n");
  platformRun.waitSecs(90); // Huge download
  platformRun.match("added platform");

  run.waitSecs(60);
  run.matchErr("Your app's platforms have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  run = s.run();
  run.waitSecs(30);
  run.match("Started your app");

  // Remove a platform via command line
  platformRun = s.run("remove-platform", "android");
  platformRun.waitSecs(15);
  platformRun.match("removed platform");

  run.waitSecs(60);
  run.matchErr("Your app's platforms have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  // Add a platform in .meteor/platforms
  run = s.run();
  run.waitSecs(30);
  run.match("Started your app");

  var platforms = s.read(files.pathJoin(".meteor", "platforms"));
  platforms = platforms + "\nandroid";
  s.write(files.pathJoin(".meteor", "platforms"), platforms);

  run.waitSecs(60);
  run.matchErr("Your app's platforms have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  // Remove a platform in .meteor/platforms
  run = s.run();
  run.waitSecs(30);
  run.match("Started your app");

  platforms = s.read(files.pathJoin(".meteor", "platforms"));
  platforms = platforms.replace(/android/g, "");
  s.write(files.pathJoin(".meteor", "platforms"), platforms);

  run.waitSecs(60);
  run.matchErr("Your app's platforms have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);
});

selftest.define("meteor exits when cordova plugins change", ["slow", "cordova"], function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "package-tests");
  s.cd("myapp");

  run = s.run("add-platform", "android");
  run.match("Do you agree");
  run.write("Y\n");
  run.waitSecs(90); // Huge download
  run.match("added platform");

  run = s.run();
  run.waitSecs(30);
  run.match("Started your app");

  // First add a plugin directly.
  var pluginRun = s.run("add", "cordova:org.apache.cordova.camera@0.3.0");
  pluginRun.waitSecs(30);
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.matchErr("Your app's Cordova plugins have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  run = s.run();
  run.waitSecs(30);
  run.match("Started your app");

  // This shouldn't cause an exit because it contains the same plugin
  // that we're already using.
  pluginRun = s.run("add", "contains-old-cordova-plugin");
  pluginRun.waitSecs(30);
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.match("restarted");

  pluginRun = s.run("remove", "contains-old-cordova-plugin");
  pluginRun.waitSecs(30);
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.match("restarted");

  // This exits because it contains a new plugin, facebookconnect.
  pluginRun = s.run("add", "contains-cordova-plugin");
  pluginRun.waitSecs(30);
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.matchErr("Your app's Cordova plugins have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  run = s.run();
  run.waitSecs(30);
  run.match("Started your app");

  pluginRun = s.run("remove", "contains-cordova-plugin");
  pluginRun.waitSecs(30);
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.matchErr("Your app's Cordova plugins have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  run = s.run();
  run.waitSecs(30);
  run.match("Started your app");

  pluginRun = s.run("remove", "cordova:org.apache.cordova.camera");
  pluginRun.waitSecs(30);
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.matchErr("Your app's Cordova plugins have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  // Adding and removing just a Meteor package that contains plugins
  // should also cause the tool to exit.
  run = s.run();
  run.waitSecs(30);
  run.match("Started your app");

  pluginRun = s.run("add", "contains-cordova-plugin");
  pluginRun.waitSecs(30);
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.matchErr("Your app's Cordova plugins have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  run = s.run();
  run.waitSecs(30);
  run.match("Started your app");

  pluginRun = s.run("remove", "contains-cordova-plugin");
  pluginRun.waitSecs(30);
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.matchErr("Your app's Cordova plugins have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  // Adding a package with a newer version of a plugin that we're
  // already using should also cause us to restart.
  pluginRun = s.run("add", "contains-old-cordova-plugin");
  pluginRun.waitSecs(30);
  pluginRun.expectExit(0);

  run = s.run();
  run.waitSecs(30);
  run.match("Started your app");

  pluginRun = s.run("add", "contains-camera-cordova-plugin");
  pluginRun.waitSecs(30);
  pluginRun.expectExit(0);

  run.matchErr("Your app's Cordova plugins have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);
});

var buildAndCheckPluginInStar = selftest.markStack(function (s, name, version) {
  var run = s.run(
    "build", "../a", "--server", "localhost:3000", "--directory");
  run.waitSecs(90);
  run.expectExit(0);

  var starJson = JSON.parse(s.read("../a/bundle/star.json"));
  var program = _.findWhere(starJson.programs, { name: "web.cordova" });
  if (! program) {
    selftest.fail("No cordova program in star.json?");
    return;
  }
  var plugins = program.cordovaDependencies;
  selftest.expectEqual(plugins[name], version);
});

selftest.define("cordova plugins in star.json, direct and transitive", ["slow", "cordova"], function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_OFFLINE_CATALOG", "t");

  run = s.run("add-platform", "android");
  run.match("Do you agree");
  run.write("Y\n");
  run.waitSecs(90); // Huge download
  run.match("added platform");

  // Add a direct dependency: it should appear in star.json after we
  // build.
  run = s.run("add", "cordova:org.apache.cordova.camera@0.3.0");
  run.waitSecs(30);
  run.expectExit(0);

  buildAndCheckPluginInStar(s, "org.apache.cordova.camera", "0.3.0");

  // Add a Cordova dependency from a package, at a newer version: the
  // plugin should appear in star.json at the version added in the
  // direct dependency, even though it's older than the version that the
  // package uses.
  run = s.run("add", "contains-camera-cordova-plugin");
  run.waitSecs(30);
  run.expectExit(0);

  buildAndCheckPluginInStar(s, "org.apache.cordova.camera", "0.3.0");

  // After removing the direct dependency, star.json should contain
  // camera@0.3.0, the version used by the package.
  run = s.run("remove", "cordova:org.apache.cordova.camera");
  run.waitSecs(30);
  run.expectExit(0);

  buildAndCheckPluginInStar(s, "org.apache.cordova.camera", "0.3.2");

  // If we add another package that uses an older version of the plugin,
  // the version in star.json shouldn't change.
  run = s.run("add", "contains-old-cordova-plugin");
  run.waitSecs(30);
  run.expectExit(0);

  buildAndCheckPluginInStar(s, "org.apache.cordova.camera", "0.3.2");

  // If we remove the package that uses a newer version, the version in
  // star.json should change.
  run = s.run("remove", "contains-camera-cordova-plugin");
  run.waitSecs(30);
  run.expectExit(0);

  buildAndCheckPluginInStar(s, "org.apache.cordova.camera", "0.3.0");
});
