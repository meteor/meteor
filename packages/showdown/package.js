// Source: https://github.com/coreyti/showdown

// XXX rename to 'markdown' and credit showdown some other way?

Package.describe({
  summary: "Markdown-to-HTML processor",
  version: "1.0.0"
});

Package.on_use(function (api) {
  api.add_files("showdown.js");
  api.export('Showdown');

  api.use("templating", "client", {weak: true});
  api.add_files('template-integration.js', 'client');
});

Package.on_test(function (api) {
  api.use("ui", "client");
});
