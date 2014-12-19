Package.describe({
  summary: "contains a plugin with colon in name",
  version: "1.0.0"
});

Package.registerBuildPlugin({
  name: "with:colon",
  use: [],
  sources: [
    'plugin.js'
  ]
});
