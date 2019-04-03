Package.describe({
  name: 'standard-minifier-css',
  version: '1.5.3',
  summary: 'Standard css minifier used with Meteor apps by default.',
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: "minifyStdCSS",
  use: [
    'minifier-css'
  ],
  npmDependencies: {
    "@babel/runtime": "7.1.2",
    "source-map": "0.5.6",
    "lru-cache": "4.1.3"
  },
  sources: [
    'plugin/minify-css.js'
  ]
});

Package.onUse(function(api) {
  api.use('isobuild:minifier-plugin@1.0.0');
});
