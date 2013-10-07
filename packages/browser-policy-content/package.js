Package.describe({
  summary: "Configure content security policies"
});

Package.on_use(function (api) {
  api.imply(["browser-policy-common"], "server");
  api.add_files("browser-policy-content.js", "server");
  api.use(["underscore", "browser-policy-common"], "server");
});
