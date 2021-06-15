// Source: https://github.com/coreyti/showdown

Package.describe({
  summary: "Markdown-to-HTML processor",
  version: "2.0.0-rc230.0",
  deprecated: true
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use("templating@1.4.0", "client", {weak: true});
  api.mainModule('template-integration.js', 'client', { lazy: true });
});

Package.onTest(function (api) {
  api.use("blaze", "client");
});
