// Source: https://github.com/coreyti/showdown

Package.describe({
  summary: "Markdown-to-HTML processor",
  version: "1.0.9"
});

Package.onUse(function (api) {
  api.addFiles("showdown.js");
  api.export('Showdown');

  api.use("templating", "client", {weak: true});
  api.addFiles('template-integration.js', 'client');
});

Package.onTest(function (api) {
  api.use("blaze", "client");
});
