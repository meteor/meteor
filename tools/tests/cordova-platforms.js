var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../fs/files.js');

selftest.define("add cordova platforms", ["cordova"], function () {
  var s = new Sandbox();
  let run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");

  run = s.run("run", "android");
  run.matchErr("Please add the Android platform to your project first");
  run.match("meteor add-platform android");
  run.expectExit(1);

  run = s.run("add-platform", "android");
  // Cordova may need to download cordova-android if it's not already
  // cached (in ~/.cordova).
  run.waitSecs(30);
  run.match("added platform");
  run.expectExit(0);

  run = s.run("add-platform", "android");
  run.matchErr("android: platform is already added");
  run.expectExit(1);

  run = s.run("remove-platform", "foo");
  run.matchErr("foo: platform is not");
  run.expectExit(1);

  run = s.run("remove-platform", "android");
  run.match("removed");
  run = s.run("run", "android");
  run.matchErr("Please add the Android platform to your project first");
  run.match("meteor add-platform android");
  run.expectExit(1);

  if (process.platform !== 'win32') {
    const originalAndroidHome = process.env.ANDROID_HOME;
    const originalPath = process.env.PATH;

    // Hide the fact that Android is installed (as it is on CircleCI) by providing
    // access to only bare system functionality. Android is installed globally in /usr/local/
    // on CircleCI and on Mac.
    s.set("ANDROID_HOME", undefined);
    s.set("PATH", "/usr/bin:/bin:/usr/sbin:/sbin");

    run = s.run("add-platform", "android");
    run.match("added platform");
    run.match("Your system does not yet seem to fulfill all requirements to build apps for Android");
    run.expectExit(0);

    run = s.run("remove-platform", "android");
    run.match("removed");
    run.expectExit(0);

    s.set("ANDROID_HOME", originalAndroidHome);
    s.set("PATH", originalPath);
  }
});
