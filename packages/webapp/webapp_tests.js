var url = Npm.require("url");
var crypto = Npm.require("crypto");

var additionalScript = "(function () { var foo = 1; })";
WebAppInternals.addStaticJs(additionalScript);
var hash = crypto.createHash('sha1');
hash.update(additionalScript);
var additionalScriptPathname = hash.digest('hex') + ".js";

Tinytest.add("webapp - content-type header", function (test) {
  var cssResource = _.find(
    _.keys(WebAppInternals.staticFiles),
    function (url) {
      return WebAppInternals.staticFiles[url].type === "css";
    }
  );
  var jsResource = _.find(
    _.keys(WebAppInternals.staticFiles),
    function (url) {
      return WebAppInternals.staticFiles[url].type === "js";
    }
  );

  var resp = HTTP.get(url.resolve(Meteor.absoluteUrl(), cssResource));
  test.equal(resp.headers["content-type"].toLowerCase(),
             "text/css; charset=utf-8");
  resp = HTTP.get(url.resolve(Meteor.absoluteUrl(), jsResource));
  test.equal(resp.headers["content-type"].toLowerCase(),
             "application/javascript; charset=utf-8");
});

Tinytest.add("webapp - additional static javascript", function (test) {
  var origInlineScriptsAllowed = WebAppInternals.inlineScriptsAllowed();

  WebAppInternals.setInlineScriptsAllowed(true);
  var resp = HTTP.get(Meteor.absoluteUrl());
  // When inline scripts are allowed, the script should be inlined.
  test.isTrue(resp.content.indexOf(additionalScript) !== -1);
  // And the script should not be served as its own separate resource
  // (so it will serve the app).
  resp = HTTP.get(Meteor.absoluteUrl() + "/" + additionalScriptPathname);
  test.isTrue(resp.content.indexOf("__meteor_runtime_config__") !== -1);

  WebAppInternals.setInlineScriptsAllowed(false);
  resp = HTTP.get(Meteor.absoluteUrl());
  // When inline scripts are disallowed, the script body should not be
  // inlined, and the script should be included in a <script src="..">
  // tag.
  test.isTrue(resp.content.indexOf(additionalScript) === -1);
  test.isTrue(resp.content.indexOf(additionalScriptPathname) !== -1);
  resp = HTTP.get(Meteor.absoluteUrl() + additionalScriptPathname);
  test.isTrue(resp.content.indexOf(additionalScript) !== -1);

  WebAppInternals.setInlineScriptsAllowed(origInlineScriptsAllowed);
});
