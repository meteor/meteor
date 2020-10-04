Package.registerBuildPlugin({
  name: "bad-minifier-2",
  sources: ['plugin.js']
});

Package.onUse(function (api) {
  api.use('isobuild:minifier-plugin@1.0.0');
});
