Package.describe({
  summary: "Configure content security policies",
  version: "1.1.3-beta2140.7"
});

Package.onUse(function (api) {
  api.use("ecmascript");
  api.use(["browser-policy-common", "webapp"], "server");
  api.imply(["browser-policy-common"], "server");
  api.mainModule("browser-policy-content.js", "server");
});
