Package.describe({
  summary: "A set of tools that improve the developer experience",
  version: '1.0.0'
});

Package.onUse(function (api) {
  api.imply('hot-code-push');
  api.imply('simple:dev-error-overlay@1.4.0');
});
