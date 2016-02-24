var _ = require('underscore');
var selftest = require('../tool-testing/selftest.js');
var httpHelpers = require('../utils/http-helpers.js');
var Sandbox = selftest.Sandbox;
var testUtils = require('../tool-testing/test-utils.js');
var config = require('../meteor-services/config.js');

// This is not an end-to-end test for Cordova hot code push, but this test
// is for the issue that we observed where the value of the
// --mobile-server argument would get lost across hot code pushes. That
// is: the initial Cordova app (before receiving any hot code pushes)
// would connect to the server specified by --mobile-server, but after
// it receives a hot code push, it would be connected to whatever
// ROOT_URL is on the server.
selftest.define(
  "cordova --mobile-server argument persists across hot code pushes", ["cordova"], function () {
    var s = new Sandbox();
    var run;

    s.createApp("myapp", "standard-app");
    s.cd("myapp");

    // Add 'android' to the .meteor/platforms file, just so that the
    // Cordova boilerplate will be generated and served, without having
    // to download the whole Android sdk.
    var platforms = s.read(".meteor/platforms");
    s.write(".meteor/platforms", platforms + "\nandroid\n");

    run = s.run("--mobile-server", "example.com");
    run.waitSecs(30);
    run.match("Started your app");

    var result = httpHelpers.getUrl(
      "http://localhost:3000/__cordova/index.html");

    var mrc = testUtils.getMeteorRuntimeConfigFromHTML(result);
    selftest.expectEqual(mrc.DDP_DEFAULT_CONNECTION_URL, "http://example.com");
    selftest.expectEqual(mrc.ROOT_URL, "http://example.com");

    run.stop();
});
