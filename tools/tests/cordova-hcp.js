var selftest = require('../tool-testing/selftest.js');
var httpHelpers = require('../utils/http-helpers.js');
var Sandbox = selftest.Sandbox;
var testUtils = require('../tool-testing/test-utils.js');

// This is not an end-to-end test for Cordova hot code push, but this test
// is for the issue that we observed where the value of the
// --mobile-server argument would get lost across hot code pushes. That
// is: the initial Cordova app (before receiving any hot code pushes)
// would connect to the server specified by --mobile-server, but after
// it receives a hot code push, it would be connected to whatever
// ROOT_URL is on the server.
selftest.define(
  "cordova --mobile-server argument persists across hot code pushes", ["cordova", "slow"], function () {
    var s = new Sandbox();
    var run;

    s.createApp("myapp", "standard-app");
    s.cd("myapp");

    // Add 'android' to the .meteor/platforms file, just so that the
    // Cordova boilerplate will be generated and served, without having
    // to download the whole Android sdk.
    var platforms = s.read(".meteor/platforms");
    s.write(".meteor/platforms", platforms + "\nandroid\n");

    run = s.run("run", "android", "--mobile-server", "example.com");
    run.waitSecs(30);
    run.match("Started your app");

    var result = httpHelpers.getUrl(
      "http://localhost:3000/__cordova/index.html");

    var mrc = testUtils.getMeteorRuntimeConfigFromHTML(result);
    selftest.expectEqual(mrc.DDP_DEFAULT_CONNECTION_URL, "http://example.com/");
    selftest.expectEqual(mrc.ROOT_URL, "http://example.com/");

    run.stop();
});

selftest.define(
  "cordova METEOR_CORDOVA_COMPAT_VERSION_* works", ["cordova", "slow"], function () {
    var s = new Sandbox();
    var run;

    var androidCompatibilityVersion = '2.0';

    // Override the compatibility version for android with METEOR_CORDOVA_COMPAT_VERSION_ANDROID.
    s.env.METEOR_CORDOVA_COMPAT_VERSION_ANDROID = androidCompatibilityVersion;

    s.createApp("myapp", "standard-app");
    s.cd("myapp");

    var platforms = s.read(".meteor/platforms");
    s.write(".meteor/platforms", platforms + "\nandroid\n");

    run = s.run("run", "android", "--mobile-server", "example.com");
    run.waitSecs(30);
    run.match("Started your app");

    var result = JSON.parse(httpHelpers.getUrl(
        "http://localhost:3000/__cordova/manifest.json"));

    // Check in the manifest if the overridden version was used.
    selftest.expectEqual(result.cordovaCompatibilityVersions.android, androidCompatibilityVersion);

    run.stop();
    // Save the iOS compatibility version.
    var iosCompatibilityVersion = result.cordovaCompatibilityVersions.ios;

    // Now exclude one of the plugins from compatibility version calculation.
    s.env.METEOR_CORDOVA_COMPAT_VERSION_EXCLUDE = 'cordova-plugin-meteor-webapp,any-other-plugin';

    run = s.run("run", "android", "--mobile-server", "example.com");
    run.waitSecs(30);
    run.match("Started your app");

    result = JSON.parse(httpHelpers.getUrl(
        "http://localhost:3000/__cordova/manifest.json"));

    // Version should be different. There is no need to check if the particular plugin was not taken into account,
    // if the version has changed it's proof enough.
    selftest.expectFalse(result.cordovaCompatibilityVersions.ios === iosCompatibilityVersion);

    run.stop();
});

selftest.define(
  "cordova plugin cordova-plugin-meteor-webapp should download manifest file for hot code push with subdirectory, and with trailing forward slash in server url and ROOT_URL", ["cordova", "slow"], function () {
    var s = new Sandbox();
    var run;

    var ipAddress = testUtils.getPrivateIPAddress();

    //url with subdirectory
    s.set("ROOT_URL", `http://${ipAddress}:3000/app/`);
    s.createApp("myapp", "hot-code-push-test");
    s.cd("myapp");

    // Add 'android' to the .meteor/platforms file, just so that the
    // Cordova boilerplate will be generated and served, without having
    // to download the whole Android sdk.
    var platforms = s.read(".meteor/platforms");
    s.write(".meteor/platforms", platforms + "\nandroid\n");

    run = s.run("run", "android", "--mobile-server", `http://${ipAddress}:3000/app/`);
    run.waitSecs(30);
    run.match("Started your app");

    //add new file to client side to trigger cordova app to check for new update
    let randomString = (Math.random() + 1).toString(36).substring(7);
    s.mkdir("client");
    s.write("client/test.js", `xyzVar = '${randomString}'`);
    run.match("Client modified -- refreshing");
    //android should download manifest file from correct url and switch to new version of app
    run.match("hot code push result: app updated to new version");
    run.stop();
});

selftest.define(
  "cordova plugin cordova-plugin-meteor-webapp should download manifest file for hot code push with subdirectory, and without trailing forward slash in server url and ROOT_URL", ["cordova", "slow"], function () {
    var s = new Sandbox();
    var run;

    var ipAddress = testUtils.getPrivateIPAddress();

    //url with subdirectory
    s.set("ROOT_URL", `http://${ipAddress}:3000/app`);
    s.createApp("myapp", "hot-code-push-test");
    s.cd("myapp");

    // Add 'android' to the .meteor/platforms file, just so that the
    // Cordova boilerplate will be generated and served, without having
    // to download the whole Android sdk.
    var platforms = s.read(".meteor/platforms");
    s.write(".meteor/platforms", platforms + "\nandroid\n");

    run = s.run("run", "android", "--mobile-server", `http://${ipAddress}:3000/app`);
    run.waitSecs(30);
    run.match("Started your app");

    //add new file to client side to trigger cordova app to check for new update
    let randomString = (Math.random() + 1).toString(36).substring(7);
    s.mkdir("client");
    s.write("client/test.js", `xyzVar = '${randomString}'`);
    run.match("Client modified -- refreshing");
    //android should download manifest file from correct url and switch to new version of app
    run.match("hot code push result: app updated to new version");
    run.stop();
});