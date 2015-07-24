Package.describe({
  name: 'benchmark',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: 'Simple benchmarking for blocks of code',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use('ecmascript');
  api.addFiles('benchmark.js', 'server');
  api.addFiles('benchmark_collection.js', 'client');
  api.export('measureDuration', 'server');
  api.export('getDurations', 'client');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('benchmark');
  api.addFiles('benchmark-tests.js');
});
