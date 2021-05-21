// Source: https://github.com/coreyti/showdown

Package.describe({
  summary: "Markdown-to-HTML processor",
  version: "1.0.14"
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use("templating@1.3.1", "client", {weak: true});
  api.mainModule('template-integration.js', 'client', { lazy: true });
});

Package.onTest(function (api) {
  api.use("blaze", "client");
});
