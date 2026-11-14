// Not devOnly: its server file, packages/test_not-devonly-local-package.js,
// ends with the name of the devonly-local-package file.
Package.describe({
  name: 'test:not-devonly-local-package',
  version: '1.0.0',
});

Package.onUse(function (api) { api.addFiles('server.js', 'server'); });
