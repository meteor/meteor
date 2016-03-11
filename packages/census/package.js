Package.describe({
  name: 'census',
  version: '0.0.1',
  summary: 'Meteor stats sampler and reporter',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use([
    'callback-hook',
    'ecmascript',
    'http',
    'underscore'
  ], 'server');

  api.addFiles([
    './setup.js',
    './utils.js',
    './stats.js',
    './reporter.js',
    './census.js'
  ], 'server');

  api.export('Census', 'server');
});

Package.onTest(function(api) {
  api.use([
    'census',
    'ddp',
    'ecmascript',
    'tinytest',
    'underscore',
    'webapp'
  ], 'server');

  api.addFiles([
    './tests/config.js',
    './tests/server.js',
    './tests/census.test.js'
  ], 'server');
});