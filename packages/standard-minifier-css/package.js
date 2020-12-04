Package.describe({
  name: 'standard-minifier-css',
  version: '1.7.1',
  summary: 'Standard css minifier used with Meteor apps by default.',
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: "minifyStdCSS",
  use: [
    'minifier-css',
    'ecmascript'
  ],
  npmDependencies: {
    "@babel/runtime": "7.11.2",
    "source-map": "0.7.3",
    "lru-cache": "6.0.0"
  },
  sources: [
    'plugin/minify-css.js'
  ]
});

Package.onUse(function(api) {
  api.use('minifier-css@1.5.3');
  api.use('isobuild:minifier-plugin@1.0.0');
});
