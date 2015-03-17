Package.describe({
  summary: "Tests for JavaScript code analysis for Meteor",
  version: "1.0.3"
});

// The tests are in a separate package so that it is possible to compile
// 'js-analyze' as a isopack and then load it via `isopack.load` without
// any dependencies.
Package.onTest(function (api) {
  api.use('tinytest');
  api.use('js-analyze');
  api.addFiles('js_analyze_tests.js', 'server');
});
