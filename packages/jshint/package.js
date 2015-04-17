Package.describe({
  name: 'jshint',
  version: '0.0.1',
  summary: 'Lint all your JavaScript files with JSHint.',
  documentation: 'README.md'
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
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('jshint');
});
