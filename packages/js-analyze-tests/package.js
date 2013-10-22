Package.describe({
  summary: "Tests for JavaScript code analysis for Meteor",
  internal: true
});

// The tests are in a separate package so that it is possible to compile
// 'js-analyze' as a unipackage and then load it via `unipackage.load` without
// any dependencies.
Package.on_test(function (api) {
  api.use('tinytest');
  api.use('js-analyze');
  api.add_files('js_analyze_tests.js', 'server');
});
