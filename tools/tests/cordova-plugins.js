var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../fs/files.js');
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

var localCordova = files.pathJoin(files.getDevBundle(), 'lib/node_modules/cordova/bin/cordova');


// Given a sandbox, that has the app as its currend cwd, read the versions file
// and read the plugins list.
//
// sand: a sandbox, that has the main app directory as its cwd.
var getCordovaPluginsList = function(sand) {
  var env = files.currentEnvWithPathsAdded(files.getCurrentNodeBinDir());
  env.METEOR_WAREHOUSE_DIR = sand.warehouse;

  var lines = selftest.execFileSync(localCordova, ['plugins'],
    {
      cwd: files.pathJoin(sand.cwd, '.meteor', 'local', 'cordova-build'),
      env: env
    }).split("\n");
  if (lines[0].match(/No plugins/)) {
    lines = [];
  }
  lines.sort();
  return lines;
}

// Given a sandbox, that has the app as its currend cwd, read the versions file
// and check that it contains the plugins that we are looking for. We don't
// check the order, we just want to make sure that the right dependencies are
// in.
//
// sand: a sandbox, that has the main app directory as its cwd.
// plugins: an array of plugins in order.
var checkCordovaPlugins = selftest.markStack(function(sand, plugins) {
  var cordovaPlugins = getCordovaPluginsList(sand);

  plugins = _.clone(plugins).sort();

  var i = 0;
  _.each(cordovaPlugins, function(line) {
    if (!line || line === '') {
      return;
    }
    // XXX should check for the version as well?
    selftest.expectEqual(line.split(' ')[0], plugins[i]);
    i++;
  });
  selftest.expectEqual(plugins.length, i);
});

// Like the function above but only looks if a certain plugin is on the list
var checkCordovaPluginExists = selftest.markStack(function(sand, plugin) {
  var cordovaPlugins = getCordovaPluginsList(sand);
  var found = false;
  cordovaPlugins = cordovaPlugins.map(function (line) {
    if (line && line !== '') {
      return line.split(' ')[0];
    }
  });
  selftest.expectTrue(_.contains(cordovaPlugins, plugin));
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
    if (!line) {
      return;
    }
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

var startAppOnAndroidEmulator = function (s) {
  var run = s.run("run", "android");
  // Building and running the app on the Android Emulator can take a long time.
  run.waitSecs(240);
  run.match("Started app on Android Emulator");
  return run;
}

var addPlatform = function (s, platform) {
  var run = s.run("add-platform", "android");
  // Cordova may need to download cordova-android if it's not already
  // cached (in ~/.cordova).
  run.waitSecs(30);
  run.match("added platform");
}

// Add plugins to an app. Change the contents of the plugins and their
// dependencies, make sure that the app still refreshes.
selftest.define("change cordova plugins", ["cordova"], function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  run = s.run();
  run.match("myapp");
  run.match("proxy");
  run.match("MongoDB");
  run.match("your app");
  run.match("running at");
  run.match("localhost");

  // Add a local package contains-cordova-plugin.
  s.write(".meteor/packages", "meteor-base \n contains-cordova-plugin");
  run.match("restarted");

  // Change something in the plugin.
  s.cp('packages/contains-cordova-plugin/package2.js', 'packages/contains-cordova-plugin/package.js');
  run.match("restarted");

  // Introduce an error.
  s.cp('packages/contains-cordova-plugin/package3.js', 'packages/contains-cordova-plugin/package.js');
  run.match("valid version");

  // Fix the error.
  s.cp('packages/contains-cordova-plugin/package2.js', 'packages/contains-cordova-plugin/package.js');
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

  run = s.run("remove", "meteor-base");
  run.match("removed");

  run = s.run("run", "android");
  run.matchErr("Please add the Android platform to your project first");
  run.match("meteor add-platform ");

  run = addPlatform(s, 'android');

  run = s.run("add", "cordova:cordova-plugin-camera@1.2.0");
  run.match("Added Cordova plugin cordova-plugin-camera");
  run.expectExit(0);

  run = s.run("add", "cordova:cordova-plugin-file");
  run.matchErr("valid version");
  run.expectExit(1);

  // The current behavior doesn't fail if a plugin is not in the registry until
  // build time.
  run = s.run("add", "cordova:foo@1.0.0");
  run.match("Added Cordova plugin foo");
  run.expectExit(0);

  run = s.run("remove", "cordova:foo");
  run.match("Removed Cordova plugin foo");
  run.expectExit(0);

  checkUserPlugins(s, ["cordova-plugin-camera"]);

  run = s.run("add", "contains-cordova-plugin");
  run.match("added,");
  run.match("contains a cordova plugin");
  run.expectExit(0);

  checkUserPlugins(s, ["cordova-plugin-camera"]);

  run = s.run("list");
  run.match("cordova-plugin-camera");

  run = s.run("list-platforms");
  run.match("android");

  run = s.run("build", '../a', "--server", "localhost:3000");
  run.waitSecs(60);
  run.expectExit(0);

  checkCordovaPlugins(s, ["cordova-plugin-camera",
    "com.phonegap.plugins.facebookconnect"]);

  // Remove a plugin
  run = s.run("remove", "contains-cordova-plugin");
  run.match("removed");

  run = s.run("build", '../a', "--server", "localhost:3000");
  run.waitSecs(60);
  run.expectExit(0);

  run = s.run("remove", "cordova:cordova-plugin-camera");
  run.match("Removed");
  run.expectExit(0);

  run = s.run("build", '../a', "--server", "localhost:3000");
  run.waitSecs(60);
  run.expectExit(0);

  checkCordovaPlugins(s, []);

  run = s.run("add", "cordova:cordova-plugin-device@1.0.1");
  run.match("Added");
  run.expectExit(0);

  run = s.run("build", '../a', "--server", "localhost:3000");
  run.waitSecs(60);
  run.expectExit(0);
  checkCordovaPlugins(s, ["cordova-plugin-device"]);

  run = s.run("remove", "cordova:cordova-plugin-device");
  run.match("Removed");
  run.expectExit(0);

  run = s.run("add", "cordova:com.example.plugin@file://");
  run.matchErr("valid version");
  run.expectExit(1);

  run = s.run("add", "cordova:com.example.plugin@file://../../plugin_directory");
  run.match("Added Cordova plugin com.example.plugin");
  run.expectExit(0);

  checkUserPlugins(s, ["com.example.plugin"]);

  // This should fail beacuse the plugin does not exists at the specified path
  run = s.run("build", '../a', "--server", "localhost:3000");
  run.waitSecs(30);
  run.expectExit(1);

  checkCordovaPlugins(s, []);

  // Add a package with Cordova.depends with local plugin (added from path)
  run = s.run("add", "empty-cordova-plugin");
  run.match("added,");
  run.match("contains an empty cordova plugin");
  run.expectExit(0);
});

selftest.define("remove cordova plugins", ['cordova'], function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  run = s.run("add", "cordova:cordova-plugin-camera@0.3.0");
  run.expectExit(0);

  checkUserPlugins(s, ["cordova-plugin-camera"]);

  // Removing a plugin that hasn't been added should say that it isn't
  // in this project.
  run = s.run("remove", "cordova:blahblah");
  run.matchErr("not in this project");
  run.forbidAll("Removed");
  run.expectExit(1);

  run = s.run("remove", "cordova:blahblah",
              "cordova:cordova-plugin-camera");
  run.matchErr("not in this project");
  run.match("Removed");
  run.expectExit(1);
  checkUserPlugins(s, []);

  run = s.run("add", "cordova:com.example.plugin@file://../../plugin_directory");
  run.match("Added Cordova plugin com.example.plugin");
  run.expectExit(0);
  checkUserPlugins(s, ["com.example.plugin"]);

  run = s.run("remove", "cordova:com.example.plugin");
  run.match("Removed");
  run.expectExit(0);
  checkUserPlugins(s, []);

});

selftest.define("meteor exits when cordova platforms it is currently running \
are removed", ["slow", "cordova"], function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "package-tests");
  s.cd("myapp");

  addPlatform(s, "android");

  run = startAppOnAndroidEmulator(s);

  // Remove a platform via command line
  platformRun = s.run("remove-platform", "android");
  platformRun.match("removed platform");

  run.waitSecs(60);
  run.matchErr("Your app's platforms have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  addPlatform(s, "android");

  // Remove a platform in .meteor/platforms
  run = startAppOnAndroidEmulator(s);

  platforms = s.read(files.pathJoin(".meteor", "platforms"));
  platforms = platforms.replace(/android/g, "");
  s.write(files.pathJoin(".meteor", "platforms"), platforms);

  run.waitSecs(60);
  run.matchErr("Your app's platforms have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);
});

selftest.define("meteor reinstalls only local cordova plugins on consecutive builds/runs", ["slow", "cordova"], function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "package-tests");
  s.cd("myapp");

  run = addPlatform(s, 'android');

  var
    pluginPath          = '../cordova-local-plugin',
    pluginSource        = "packages/empty-cordova-plugin/plugin",
    androidPluginSource = ".meteor/local/cordova-build/platforms/android/src";


  // Copy fake cordova plugin to ../cordova-local-plugin
  s.mkdir(pluginPath);
  s.cp(pluginSource + '/plugin.xml', pluginPath + '/plugin.xml');
  s.mkdir(pluginPath + '/www');
  s.mkdir(pluginPath + '/src');
  s.mkdir(pluginPath + '/src/android');
  s.cp(pluginSource + '/www/Empty.js', pluginPath +'/www/Empty.js');
  s.cp(
    pluginSource + '/src/android/Empty.java',
    pluginPath + '/src/android/Empty.java'
  );

  // Add the local cordova plugin
  run = s.run("add", "cordova:com.cordova.empty@file://../cordova-local-plugin");
  run.match("Added Cordova plugin com.cordova.empty");
  run.expectExit(0);

  checkUserPlugins(s, ["com.cordova.empty"]);

  // Run meteor and check if the cordova android build have the plugin file.
  run = startAppOnAndroidEmulator(s);
  run.stop();

  selftest.expectTrue(
    s.read(
      androidPluginSource + "/com/cordova/empty/Empty.java"
    ).indexOf('change') === -1
  );
  selftest.expectTrue(
    s.read(
      androidPluginSource + "/com/cordova/empty/Empty.java"
    ).indexOf('CordovaPlugin') > -1
  );

  // Copy changed file to the plugin
  s.cp(
    pluginSource + '/src/android/Empty_changed.java',
    pluginPath + '/src/android/Empty.java'
  );

  // Check if the local plugin will be refreshed
  run = startAppOnAndroidEmulator(s);
  run.stop();

  selftest.expectTrue(
    s.read(
      androidPluginSource + "/com/cordova/empty/Empty.java"
    ).indexOf('change') > -1
  );

  // Now test the same scenario but with builds
  s.cp(
    pluginSource + '/src/android/Empty.java',
    pluginPath + '/src/android/Empty.java'
  );

  run = s.run("build", '../a', "--server", "localhost:3000");
  run.waitSecs(60);
  run.expectExit(0);

  selftest.expectTrue(
    s.read(
      '../a/android/project/src/com/cordova/empty/Empty.java'
    ).indexOf('change') === -1
  );

  checkCordovaPluginExists(s, "com.cordova.empty");

  s.cp(
    pluginSource + '/src/android/Empty_changed.java',
    pluginPath + '/src/android/Empty.java'
  );

  run = s.run("build", '../a', "--server", "localhost:3000");
  run.waitSecs(60);
  run.expectExit(0);

  selftest.expectTrue(
    s.read(
      '../a/android/project/src/com/cordova/empty/Empty.java'
    ).indexOf('change') > -1
  );
});

selftest.define("meteor exits when cordova plugins change", ["slow", "cordova"], function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "package-tests");
  s.cd("myapp");

  addPlatform(s, "android");

  run = startAppOnAndroidEmulator(s);

  // First add a plugin directly.
  var pluginRun = s.run("add", "cordova:cordova-plugin-camera@1.0.0");
  pluginRun.expectExit(0);

  run.waitSecs(60);
  run.matchErr("Your app's Cordova plugins have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  run = startAppOnAndroidEmulator(s);

  // This shouldn't cause an exit because it contains the same plugin
  // that we're already using.
  pluginRun = s.run("add", "contains-old-cordova-plugin");
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.match("restarted");

  pluginRun = s.run("remove", "contains-old-cordova-plugin");
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.match("restarted");

  // This exits because it contains a new plugin, facebookconnect.
  pluginRun = s.run("add", "contains-cordova-plugin");
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.matchErr("Your app's Cordova plugins have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  run = startAppOnAndroidEmulator(s);

  pluginRun = s.run("remove", "contains-cordova-plugin");
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.matchErr("Your app's Cordova plugins have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  run = startAppOnAndroidEmulator(s);

  pluginRun = s.run("remove", "cordova:cordova-plugin-camera");
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.matchErr("Your app's Cordova plugins have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  // Adding and removing just a Meteor package that contains plugins
  // should also cause the tool to exit.
  run = startAppOnAndroidEmulator(s);

  pluginRun = s.run("add", "contains-cordova-plugin");
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.matchErr("Your app's Cordova plugins have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  run = startAppOnAndroidEmulator(s);

  pluginRun = s.run("remove", "contains-cordova-plugin");
  pluginRun.expectExit(0);
  run.waitSecs(60);
  run.matchErr("Your app's Cordova plugins have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);

  // Adding a package with a newer version of a plugin that we're
  // already using should also cause us to restart.
  pluginRun = s.run("add", "contains-old-cordova-plugin");
  pluginRun.expectExit(0);

  run = startAppOnAndroidEmulator(s);

  pluginRun = s.run("add", "contains-camera-cordova-plugin");
  pluginRun.expectExit(0);

  run.matchErr("Your app's Cordova plugins have changed");
  run.matchErr("Restart meteor");
  run.expectExit(254);
});

var buildAndCheckPluginInStar = selftest.markStack(function (s, name, version) {
  var run = s.run(
    "build", '../a', "--server", "localhost:3000", "--directory");
  run.waitSecs(60);
  run.expectExit(0);

  var starJson = JSON.parse(s.read('../a/bundle/star.json'));
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

  run = addPlatform(s, 'android');

  // Add a direct dependency: it should appear in star.json after we
  // build.
  run = s.run("add", "cordova:cordova-plugin-camera@1.0.0");
  run.expectExit(0);

  buildAndCheckPluginInStar(s, "cordova-plugin-camera", "1.0.0");

  // Add a Cordova dependency from a package, at a newer version: the
  // plugin should appear in star.json at the version added in the
  // direct dependency, even though it's older than the version that the
  // package uses.
  run = s.run("add", "contains-camera-cordova-plugin");
  run.expectExit(0);

  buildAndCheckPluginInStar(s, "cordova-plugin-camera", "1.0.0");

  // After removing the direct dependency, star.json should contain
  // camera@1.2.0, the version used by the package.
  run = s.run("remove", "cordova:cordova-plugin-camera");
  run.expectExit(0);

  buildAndCheckPluginInStar(s, "cordova-plugin-camera", "1.2.0");

  // If we add another package that uses an older version of the plugin,
  // the version in star.json shouldn't change.
  run = s.run("add", "contains-old-cordova-plugin");
  run.expectExit(0);

  buildAndCheckPluginInStar(s, "cordova-plugin-camera", "1.2.0");

  // If we remove the package that uses a newer version, the version in
  // star.json should change.
  run = s.run("remove", "contains-camera-cordova-plugin");
  run.expectExit(0);

  buildAndCheckPluginInStar(s, "cordova-plugin-camera", "1.0.0");
});
