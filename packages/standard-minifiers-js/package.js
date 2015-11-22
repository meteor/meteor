Package.describe({
  name: 'standard-minifiers-js',
  version: '1.0.2',
  summary: 'Standard javascript minifiers used with Meteor apps by default.',
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: "minifyStdJS",
  use: [
    'minifiers-js'
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
