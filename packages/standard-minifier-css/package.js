Package.describe({
  name: 'standard-minifier-css',
  version: '1.10.2',
  summary: 'Standard css minifier used with Meteor apps by default.',
  documentation: 'README.md',
  devOnly: true,
});

Package.registerBuildPlugin({
  name: "minifyStdCSS",
  use: [
    'minifier-css@2.0.2',
    'ecmascript',
    'logging',
  ],
  npmDependencies: {
    "@babel/runtime": "7.23.5",
    "source-map": "0.7.4",
    "lru-cache": "6.0.0",
    "micromatch": "4.0.5",
  },
  sources: [
    'plugin/minify-css.js',
  ]
});

Package.onUse(function(api) {
  api.use('minifier-css@2.0.2');
  api.use('isobuild:minifier-plugin@1.0.0');
  api.use('logging');
});
