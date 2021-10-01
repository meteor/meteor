Package.registerBuildPlugin({
  name: "bad-minifier",
  sources: ['plugin.js']
});

Package.onUse(function (api) {
  api.use('isobuild:minifier-plugin@1.0.0');
});
