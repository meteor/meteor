// Source: https://github.com/coreyti/showdown

Package.describe({
  summary: "Markdown-to-HTML processor",
  version: "3.0.0-alpha300.19",
  deprecated: true,
  documentation: 'README.md'
});

Package.onUse(function (api) {
  api.use('ecmascript@0.16.8-alpha300.19');
  api.use("templating@1.4.2", "client", {weak: true});
  api.mainModule('template-integration.js', 'client');
});

Package.onTest(function (api) {
  api.use("blaze", "client");
});
