Package.describe({
  name: 'standard-minifier-css',
  version: '2.0.0-alpha300.9',
  summary: 'Standard css minifier used with Meteor apps by default.',
  documentation: 'README.md',
});

Package.registerBuildPlugin({
  name: "minifyStdCSS",
  use: [
    'minifier-css',
    'ecmascript',
    'logging',
  ],
  npmDependencies: {
    "@babel/runtime": "7.21.0",
    "source-map": "0.7.4",
    "lru-cache": "8.0.0",
    "micromatch": "4.0.5",
  },
  sources: [
    'plugin/minify-css.js',
  ]
});

Package.onUse(function(api) {
  api.use('minifier-css');
  api.use('isobuild:minifier-plugin@1.0.0');
  api.use('logging@2.0.0-alpha300.5');
});
