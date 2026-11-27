Package.describe({
  name: 'test:devonly-author-package',
  version: '1.0.0',
  devOnly: true,
});

Package.onUse(function (api) { api.addFiles('server.js', 'server'); });
