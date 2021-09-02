Package.describe({
  name: 'standard-minifier-js',
  version: '2.7.0-rc240.4',
  summary: 'Standard javascript minifiers used with Meteor apps by default.',
  documentation: 'README.md',
});

Package.registerBuildPlugin({
  name: "minifyStdJS",
  use: [
    'minifier-js',
    'ecmascript'
  ],
  npmDependencies: {
    "@babel/runtime": "7.15.3"
  },
  sources: [
    'plugin/minify-js.js',
    'plugin/stats.js',
  ],
});

Package.onUse(function(api) {
  api.use('isobuild:minifier-plugin@1.0.0');
});
