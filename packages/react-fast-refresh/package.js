Package.describe({
  name: 'react-fast-refresh',
  version: '0.3.0-rc340.2',
  summary: 'Automatically update React components with HMR',
  documentation: 'README.md',
});

Npm.depends({
  'react-refresh': '0.14.0',
  semver: '7.5.4',
});

Package.onUse(function(api) {
  api.export('ReactFastRefresh');
  api.use('modules');
  api.addFiles('server.js', 'server');
  api.addFiles('client.js', 'client');
  api.use('hot-module-replacement', { weak: true });
});
