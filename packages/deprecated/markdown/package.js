// Source: https://github.com/coreyti/showdown

Package.describe({
  summary: "Markdown-to-HTML processor",
  version: "2.0.0",
  deprecated: true,
  documentation: 'README.md'
});

Package.onUse(function (api) {
  api.versionsFrom('2.2');
  api.use('ecmascript');
  api.use("templating@1.4.0", "client", {weak: true});
  api.mainModule('template-integration.js', 'client', { lazy: true });
});

Package.onTest(function (api) {
  api.use("blaze", "client");
});
