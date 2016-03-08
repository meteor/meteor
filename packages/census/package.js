Package.describe({
  name: 'census',
  version: '0.0.1',
  summary: 'Meteor data sampler and reporter',
  documentation: 'README.md'
});

Npm.depends({
  request: "2.53.0"
});

Package.onUse(function(api) {
  api.use([
    'ecmascript',
    'underscore'
  ]);

  api.addFiles([
    './cencus.js',
    './stats.js',
    './utils.js'
  ], 'server');

  api.export('Census', 'server');
});