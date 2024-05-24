var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("add cordova platforms", ["cordova"], async function () {
  var s = new Sandbox();
  await s.init();

  let run;

  // Starting a run
  await s.createApp("myapp", "package-tests");
  s.cd("myapp");

  run = s.run("run", "android");
  await run.matchErr("Please add the Android platform to your project first");
  await run.match("meteor add-platform android");
  await run.expectExit(1);

  run = s.run("add-platform", "android");
  // Cordova may need to download cordova-android if it's not already
  // cached (in ~/.cordova).
  run.waitSecs(30);
  await run.match("added platform");
  await run.expectExit(0);

  run = s.run("add-platform", "android");
  await run.matchErr("android: platform is already added");
  await run.expectExit(1);

  run = s.run("remove-platform", "foo");
  await run.matchErr("foo: platform is not");
  await run.expectExit(1);

  run = s.run("remove-platform", "android");
  await run.match("removed");
  run = s.run("run", "android");
  await run.matchErr("Please add the Android platform to your project first");
  await run.match("meteor add-platform android");
  await run.expectExit(1);

  if (process.platform !== 'win32') {
    const originalAndroidHome = process.env.ANDROID_HOME;
    const originalPath = process.env.PATH;
    const originalAndroidSdkRoot = process.env.ANDROID_SDK_ROOT;
    const originalHome = process.env.HOME;

    // Hide the fact that Android is installed (as it is on CircleCI) by providing
    // access to only bare system functionality. Android is installed globally in /usr/local/
    // on CircleCI and on Mac.
    s.set("ANDROID_HOME", undefined);
    s.set("ANDROID_SDK_ROOT", undefined);
    s.set("HOME", undefined);
    s.set("PATH", "/usr/bin:/bin:/usr/sbin:/sbin");

    run = s.run("add-platform", "android");
    await run.match("added platform");
    await run.match("Your system does not yet seem to fulfill all requirements to build apps for Android");
    await run.expectExit(0);

    run = s.run("remove-platform", "android");
    await run.match("removed");
    await run.expectExit(0);

    s.set("ANDROID_HOME", originalAndroidHome);
    s.set("ANDROID_SDK_ROOT", originalAndroidSdkRoot);
    s.set("HOME", originalHome);
    s.set("PATH", originalPath);
  }
});
