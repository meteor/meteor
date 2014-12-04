Package.describe({
  summary: "Configure content security policies",
  version: "1.0.3-ipc.0"
});

Package.on_use(function (api) {
  api.imply(["browser-policy-common"], "server");
  api.add_files("browser-policy-content.js", "server");
  api.use(["underscore", "browser-policy-common", "webapp"], "server");
});
