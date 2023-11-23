Package.describe({
  summary: "Configure content security policies",
  version: '2.0.0-alpha300.19',
});

Package.onUse(function (api) {
  api.use("ecmascript");
  api.use("modules");
  api.use(["underscore", "browser-policy-common", "webapp"], "server");
  api.imply(["browser-policy-common"], "server");
  api.mainModule("browser-policy-content.js", "server");
});
