Package.describe({
  name: 'jshint',
  version: '1.1.8',
  summary: 'Lint all your JavaScript files with JSHint.',
  documentation: 'README.md',
  deprecated: true
});

Package.registerBuildPlugin({
  name: "lintJshint",
  sources: [
    'plugin/lint-jshint.js'
  ],
  npmDependencies: {
    "jshint": "2.7.0"
  }
});

Package.onUse(function(api) {
  api.use('isobuild:linter-plugin@1.0.0');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('jshint');
});
