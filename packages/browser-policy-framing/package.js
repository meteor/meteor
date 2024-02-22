Package.describe({
  summary: "Restrict which websites can frame your app",
  version: '1.1.3-beta300.3'
});

Package.onUse(function (api) {
  api.use("modules");
  api.use(["browser-policy-common"], "server");
  api.imply(["browser-policy-common"], "server");
  api.mainModule("browser-policy-framing.js", "server");
});
