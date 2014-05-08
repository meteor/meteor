var url = Npm.require("url");

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
