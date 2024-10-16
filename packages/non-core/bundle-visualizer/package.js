Package.describe({
  version: '1.2.6',
  summary: 'Meteor bundle analysis and visualization.',
  documentation: 'README.md',
});

Npm.depends({
  "d3-selection": "1.0.5",
  "d3-shape": "1.0.6",
  "d3-hierarchy": "1.1.4",
  "d3-transition": "1.0.4",
  "d3-collection": "1.0.4",
  "pretty-bytes": "4.0.2",
});

Package.onUse(function(api) {
  api.use('isobuild:dynamic-import@1.5.0');
  api.use([
    'ecmascript@0.16.9',
    'dynamic-import@0.7.4',
    'fetch@0.1.5',
    'webapp@2.0.1',
  ]);
  api.mainModule('server.js', 'server');
  api.mainModule('client.js', 'client');
});
