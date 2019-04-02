Package.describe({
  name: 'standard-minifier-js',
  version: '2.4.1',
  summary: 'Standard javascript minifiers used with Meteor apps by default.',
  documentation: 'README.md',
});

Package.registerBuildPlugin({
  name: "minifyStdJS",
  use: [
    'minifier-js',
    'babel-compiler',
    'ecmascript'
  ],
  npmDependencies: {
    "@babel/runtime": "7.0.0"
  },
  sources: [
    'plugin/minify-js.js',
    'plugin/stats.js',
    'plugin/utils.js',
  ],
});

Package.onUse(function(api) {
  api.use('isobuild:minifier-plugin@1.0.0');
});
