Package.describe({
  summary: "Dependency tracker to allow reactive callbacks",
  version: "1.2.0"
});

Package.onUse(function (api) {
  api.use("ecmascript");
  api.addFiles("tracker.js");
  api.export("Tracker");
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('test-helpers');
  api.use('tracker');
  api.addFiles('tracker_tests.js', 'client');
});
