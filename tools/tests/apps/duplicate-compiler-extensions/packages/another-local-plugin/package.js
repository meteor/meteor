Package.registerBuildPlugin({
  name: "anotherCompiler",
  sources: ['plugin.js']
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
});
