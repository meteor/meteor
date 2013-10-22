Package.describe({
  summary: "A package for translating old bundles into stars",
  internal: true
});

Package.on_use(function (api) {
  api.use(['dev-bundle-fetcher']);
  api.export('StarTranslator');
  api.add_files(['translator.js'], 'server');
});

Npm.depends({ncp: "0.4.2"});
