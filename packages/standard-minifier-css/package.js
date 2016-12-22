Package.describe({
  name: 'standard-minifier-css',
  version: '1.3.3-beta.1',
  summary: 'Standard css minifier used with Meteor apps by default.',
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: "minifyStdCSS",
  use: [
    'minifier-css@1.2.14'
  ],
  npmDependencies: {
    "source-map": "0.5.6",
    "lru-cache": "4.0.1"
  },
  sources: [
    'plugin/minify-css.js'
  ]
});

Package.onUse(function(api) {
  api.use('isobuild:minifier-plugin@1.0.0');
});
