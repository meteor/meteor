Package.describe({
  summary: "A set of tools that improve the developer experience",
  version: '1.0.0',
  debugOnly: true
});

Package.onUse(function (api) {
  api.imply('simple:dev-error-overlay@1.4.0');
});
