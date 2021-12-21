Package.describe({
  name: 'standard-minifier-js',
  version: '2.8.0',
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
    "@babel/runtime": "7.15.4"
  },
  sources: [
    'plugin/minify-js.js',
    'plugin/stats.js',
  ],
});

Package.onUse(function(api) {
  api.use('isobuild:minifier-plugin@1.0.0');
});
