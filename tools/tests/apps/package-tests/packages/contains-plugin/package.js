Package.describe({
  summary: "contains a plugin",
  version: "1.1.0"
});

Package.registerBuildPlugin({
  name: "myPlugin",
  use: [],
  sources: [
    'plugin/plugin.js'
  ],
});
