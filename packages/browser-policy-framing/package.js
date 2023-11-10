Package.describe({
  summary: "Restrict which websites can frame your app",
  version: '1.1.2'
});

Package.onUse(function (api) {
  api.use("modules");
  api.use(["browser-policy-common"], "server");
  api.imply(["browser-policy-common"], "server");
  api.mainModule("browser-policy-framing.js", "server");
});
