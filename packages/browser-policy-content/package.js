Package.describe({
  summary: "Configure content security policies",
  version: "1.0.6"
});

Package.onUse(function (api) {
  api.imply(["browser-policy-common"], "server");
  api.addFiles("browser-policy-content.js", "server");
  api.use(["underscore", "browser-policy-common", "webapp"], "server");
});
