Package.describe({
  name: 'custom-minifier',
  version: '0.0.1',
  documentation: null
});

Package.registerBuildPlugin({
  name: "minifyCustom",
  sources: [
    'plugin/minify.js'
  ]
});

Package.onUse(function(api) {
  api.use('isobuild:minifier-plugin@1.0.0');
});
