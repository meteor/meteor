Package.describe({
  summary: "Restrict which websites can frame your app",
  version: "1.0.3-ipc.0"
});

Package.on_use(function (api) {
  api.imply(["browser-policy-common"], "server");
  api.use(["underscore", "browser-policy-common"], "server");
  api.add_files("browser-policy-framing.js", "server");
});
