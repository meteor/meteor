Package.describe({
  summary: "Configure security policies enforced by the browser"
});

Package.on_use(function (api) {
  api.use(["underscore", "webapp"], "server");
  api.add_files("browser-policy.js", "server");
  api.export("BrowserPolicy", "server");
});
