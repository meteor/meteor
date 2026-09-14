// A namespaced package (name contains ':') with its own npm dependency.
// The bundle file is written as packages/test_npm-dep.js while core-runtime
// queues it under "test:npm-dep"; the ESM loader must map both.
Package.describe({ name: 'test:npm-dep', version: '0.0.1' });

Npm.depends({ 'left-pad': '1.3.0' });

Package.onUse(function (api) {
  api.mainModule('server.js', 'server');
});
