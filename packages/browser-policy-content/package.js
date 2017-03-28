Package.describe({
  summary: "Configure content security policies",
  version: "1.1.0"
});

Package.onUse(function (api) {
  api.use("modules");
  api.use(["underscore", "browser-policy-common", "webapp"], "server");
  api.imply(["browser-policy-common"], "server");
  api.mainModule("browser-policy-content.js", "server");
});
