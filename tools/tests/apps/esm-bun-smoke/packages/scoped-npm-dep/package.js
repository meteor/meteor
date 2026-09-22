// Scoped (author:name) local package with an npm dependency.
//
// Regression coverage for the ESM loader: package code requiring an npm module
// goes through the virtual id /node_modules/meteor/smoke:scoped-npm-dep/node_modules/left-pad,
// whose on-disk directory is npm/node_modules/meteor/smoke_scoped-npm-dep (colon
// mapped to underscore). Unscoped packages never exercise that mapping, and a
// dependency hoisted into programs/server/node_modules (like `ms`) would hide it.
Package.describe({
  name: 'smoke:scoped-npm-dep',
  version: '0.0.1',
  summary: 'Scoped package with an npm dependency, used by the ESM/Bun smoke test',
});

Npm.depends({ 'left-pad': '1.3.0' });

Package.onUse(function (api) {
  api.use('ecmascript', 'server');
  api.mainModule('server.js', 'server');
});
