Package.describe({
  name: 'jshint',
  version: '1.1.5',
  summary: 'Lint all your JavaScript files with JSHint.',
  documentation: 'README.md',
  git: 'https://github.com/meteor/meteor/tree/master/packages/jshint'
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
