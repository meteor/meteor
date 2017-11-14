Package.describe({
  summary: "Random number generator and utilities",
  version: '1.0.10'
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.export('Random');
  api.addFiles('random.js');
});

Package.onTest(function(api) {
  api.use('random');
  api.use('ecmascript');
  api.use('tinytest');
  api.addFiles('random_tests.js', ['client', 'server']);
});
