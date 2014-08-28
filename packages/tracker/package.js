// XXX rename package?

Package.describe({
  summary: "Dependency tracker to allow reactive callbacks",
  version: '1.0.1'
});

Package.on_use(function (api) {
  api.export('Tracker');
  api.add_files('tracker.js');
  api.add_files('deprecated.js');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('tracker');
  api.add_files('tracker_tests.js', 'client');
});
