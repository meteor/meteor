Package.describe({
  summary: "A package for translating old bundles into stars",
  version: "1.0.5"
});

Package.onUse(function (api) {
  api.use(['dev-bundle-fetcher']);
  api.export('StarTranslator');
  api.addFiles(['translator.js'], 'server');
});

Npm.depends({ncp: "0.4.2"});
