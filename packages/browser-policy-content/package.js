Package.describe({
  summary: "Configure content security policies",
  version: '2.0.0-beta300.5',
});

Package.onUse(function (api) {
  api.use("ecmascript");
  api.use("ecmascript");
  api.use(["browser-policy-common", "webapp"], "server");
  api.imply(["browser-policy-common"], "server");
  api.mainModule("browser-policy-content.js", "server");
});
