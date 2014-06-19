var httpHelpers = require('../http-helpers.js');
var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var unipackage = require('../unipackage.js');
var release = require('../release.js');
var utils = require("../utils.js");

var fetchPage = function (path) {
  var result = httpHelpers.request("http://localhost:3000" + (path || ""));
  if (result.response.statusCode !== 200) {
    throw new Error("Response status code: ", result.response.statusCode);
  }
  return result;
};

var runApp = function (s) {
  var run = s.run();
  run.waitSecs(5);
  run.match("Started your app");
  return run;
};

var scriptTagSafetyBelt =
      '<script type="text/javascript" src="/meteor_reload_safetybelt.js">';
var checkResponse = function (body, reloadSafetyBelt, options) {
  if (! body) {
    throw new Error("Missing response body");
  }

  if (options.inlineSafetyBelt) {
    if (body.indexOf(reloadSafetyBelt) === -1) {
      throw new Error("Missing reload safety belt inline");
    }
  } else {
    if (body.indexOf(reloadSafetyBelt) !== -1) {
      throw new Error("Reload safety belt inline when it shouldn't be present");
    }
  }

  if (options.scriptTagSafetyBelt) {
    if (body.indexOf(scriptTagSafetyBelt) === -1) {
      throw new Error("Missing reload safety belt script tag");
    }
  } else {
    if (body.indexOf(scriptTagSafetyBelt) !== -1) {
      throw new Error(
        "Reload safety belt in script tag when it shouldn't be present");
    }
  }
};

selftest.define("galaxy reload safety belt", function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "standard-app");
  s.cd("myapp");
  run = runApp(s);

  var result = fetchPage();

  var Package = unipackage.load({
    library: release.current.library,
    packages: [ 'meteor', 'galaxy-reload-safetybelt' ],
    release: release.current.name
  });

  var reloadSafetyBelt = Package["galaxy-reload-safetybelt"].ReloadSafetyBelt;

  // Reload safety belt should not be present in response when the
  // package hasn't been added to the app.
  checkResponse(result.body, reloadSafetyBelt, {
    inlineSafetyBelt: false,
    scriptTagSafetyBelt: false
  });

  run.stop();

  run = s.run("add", "galaxy-reload-safetybelt");
  run.waitSecs(5);
  run.expectExit(0);

  run = runApp(s);
  result = fetchPage();

  // Reload safety belt should be present in response when the package
  // has been added to the app.
  checkResponse(result.body, reloadSafetyBelt, {
    inlineSafetyBelt: true,
    scriptTagSafetyBelt: false
  });

  run.stop();

  // Disable inline scripts; reload safety belt should be loaded from a
  // script tag.
  run = s.run("add", "browser-policy-content");
  run.waitSecs(5);
  run.expectExit(0);

  s.write(
    "inline.js",
    "if (Meteor.isServer) BrowserPolicy.content.disallowInlineScripts();"
  );

  run = runApp(s);
  result = fetchPage();

  // When inline scripts are disallowed, the reload safety belt should
  // NOT be present in the response, but it should be loaded from a
  // script tag.
  checkResponse(result.body, reloadSafetyBelt, {
    inlineSafetyBelt: false,
    scriptTagSafetyBelt: true
  });

  result = fetchPage("/meteor_reload_safetybelt.js");
  checkResponse(result.body, reloadSafetyBelt, {
    inlineSafetyBelt: true,
    scriptTagSafetyBelt: false
  });

  run.stop();

  // Remove the package; reload safety belt should go away.
  run = s.run("remove", "galaxy-reload-safetybelt");
  run.waitSecs(5);
  run.expectExit(0);

  run = runApp(s);
  result = fetchPage();
  checkResponse(result.body, reloadSafetyBelt, {
    inlineSafetyBelt: false,
    scriptTagSafetyBelt: false
  });

  run.stop();
});
