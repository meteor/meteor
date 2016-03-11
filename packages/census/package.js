Package.describe({
  name: 'census',
  version: '0.0.1',
  summary: 'Meteor data sampler and reporter',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use([
    'ecmascript',
    'underscore',
    'http'
  ]);

  api.addFiles([
    './utils.js',
    './config.js',
    './stats.js',
    './cencus.js'
  ], 'server');

  api.export('Census', 'server');
});

Package.onTest(function(api) {
  api.use([
    'census',
    'ddp',
    'ecmascript',
    'underscore',
    'tinytest',
    'webapp'
  ]);

  api.addFiles([
    './tests/config.js',
    './tests/server.js',
    './tests/census.test.js'
  ], 'server');
});