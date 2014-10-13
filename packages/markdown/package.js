// Source: https://github.com/coreyti/showdown

Package.describe({
  summary: "Markdown-to-HTML processor",
  version: "1.0.2"
});

Package.on_use(function (api) {
  api.add_files("showdown.js");
  api.export('Showdown');

  api.use("templating", "client", {weak: true});
  api.add_files('template-integration.js', 'client');
});

Package.on_test(function (api) {
  api.use("blaze", "client");
});
