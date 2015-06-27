Package.describe({
  name: 'standard-minifiers',
  version: '0.0.1',
  summary: 'Standard minifiers used with Meteor apps by default.',
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: "minifyStd",
  use: [
    'minifier-plugin',
    'minifiers'
  ],
  npmDependencies: {
    "source-map": "0.4.2"
  },
  sources: [
    'plugin/minify-js.js',
    'plugin/minify-css.js'
  ]
});

Package.onUse(function(api) {
});

Package.onTest(function(api) {
});
