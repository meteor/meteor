Package.describe({
  name: 'react-fast-refresh',
  version: '0.1.0-beta200.6',
  summary: 'Automatically update React components with HMR',
  documentation: 'README.md',
  devOnly: true
});

Npm.depends({
  'react-refresh': '0.8.3'
});

Package.onUse(function (api) {
  api.export('ReactFastRefresh');
  api.use('modules');
  api.addFiles('server.js', 'server');
  api.addFiles('client-runtime.js', 'web.browser');
});
