Package.describe({
  name: 'symlink-e2e-package',
  summary: 'Symlinked local package used by the E2E symlink fixture',
  version: '1.0.0',
});

Package.onUse(function (api) {
  api.use('ecmascript', ['client', 'server']);
  api.mainModule('symlink-e2e-package.js', ['client', 'server']);
});
