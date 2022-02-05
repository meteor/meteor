Package.describe({
  summary: 'Minifier for Meteor with PostCSS processing',
  version: '1.0.0-beta261.0',
  name: 'minifier-css-postcss'
});

Package.registerBuildPlugin({
  name: 'minifier-css-postcss',
  use: ['ecmascript', 'minifier-css'],
  npmDependencies: {
    'source-map': '0.5.6',
    'app-module-path': '2.2.0',
    'lru-cache': '6.0.0',
    'micromatch': '4.0.4'
  },
  sources: [
    'plugin/minify-css-postcss.js'
  ]
});

Package.onUse(function (api) {
  api.use('isobuild:minifier-plugin@1.0.0');
});
