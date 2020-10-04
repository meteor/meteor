Package.describe({
  summary: "Restrict which websites can frame your app",
  version: "1.1.0"
});

Package.onUse(function (api) {
  api.use("modules");
  api.use(["underscore", "browser-policy-common"], "server");
  api.imply(["browser-policy-common"], "server");
  api.mainModule("browser-policy-framing.js", "server");
});
