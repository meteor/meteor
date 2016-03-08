Package.describe({
  name: 'census',
  version: '0.0.1',
  summary: 'Meteor data sampler and reporter',
  documentation: 'README.md'
});

Npm.depends({
  request: '2.53.0'
});

Package.onUse(function(api) {
  api.use([
    'ecmascript',
    'underscore'
  ]);

  api.addFiles([
    './utils.js',
    './config.js',
    './stats.js',
    './cencus.js'
  ], 'server');

  api.export('Census', 'server');
});