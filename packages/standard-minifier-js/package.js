Package.describe({
  name: 'standard-minifier-js',
  version: '2.6.0',
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
    "@babel/runtime": "7.7.4"
  },
  sources: [
    'plugin/minify-js.js',
    'plugin/stats.js',
    'plugin/utils.js',
  ],
  npmDependencies: {
    'concat-with-sourcemaps': '1.1.0'
  }
});

Package.onUse(function(api) {
  api.use('isobuild:minifier-plugin@1.0.0');
});
