Package.describe({
  name: 'react-fast-refresh',
  version: '1.0.0-alpha300.3',
  summary: 'Automatically update React components with HMR',
  documentation: 'README.md',
  devOnly: true,
});

Npm.depends({
  'react-refresh': '0.14.0',
  semver: '7.3.8',
});

Package.onUse(function(api) {
  api.export('ReactFastRefresh');
  api.use('modules');
  api.addFiles('server.js', 'server');
  api.addFiles('client.js', 'client');
  api.use('hot-module-replacement', { weak: true });
});
