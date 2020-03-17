Package.describe({
  name: 'standard-minifier-css',
  version: '1.6.0',
  summary: 'Standard css minifier used with Meteor apps by default.',
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: "minifyStdCSS",
  use: [
    'minifier-css'
  ],
  npmDependencies: {
    "@babel/runtime": "7.6.0",
    "source-map": "0.6.1",
    "lru-cache": "5.1.1"
  },
  sources: [
    'plugin/minify-css.js'
  ]
});

Package.onUse(function(api) {
  api.use('isobuild:minifier-plugin@1.0.0');
});
