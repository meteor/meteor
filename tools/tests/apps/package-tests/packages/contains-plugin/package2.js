Package.describe({
  summary: "contains a plugin",
  version: "1.1.0"
});

Package._transitional_registerBuildPlugin({
  name: "myPlugin",
  use: [],
  sources: [
    'plugin/plugin.js'
  ],
});

Package.on_use(function (api) {
  api.use('accounts-base');
});
