Package.describe({
  summary: "contains a plugin with colon in name",
  version: "1.0.0"
});

Package._transitional_registerBuildPlugin({
  name: "with:colon",
  use: [],
  sources: [
    'plugin.js'
  ]
});
