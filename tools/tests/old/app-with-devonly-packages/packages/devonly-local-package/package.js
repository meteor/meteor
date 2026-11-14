Package.describe({
  name: 'devonly-local-package',
  version: '1.0.0',
  devOnly: true,
});

Package.onUse(function (api) { api.addFiles('server.js', 'server'); });
