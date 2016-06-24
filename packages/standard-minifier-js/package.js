Package.describe({
  name: 'standard-minifier-js',
  version: '1.0.7_1',
  summary: 'Standard javascript minifiers used with Meteor apps by default.',
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: "minifyStdJS",
  use: [
    'minifier-js'
  ],
  sources: [
    'plugin/minify-js.js'
  ]
});

Package.onUse(function(api) {
  api.use('isobuild:minifier-plugin@1.0.0');
});

Package.onTest(function(api) {
});
