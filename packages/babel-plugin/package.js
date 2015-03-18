Package.describe({
  summary: "Build plugin that transpiles .es6 files with Babel",
  version: '1.0.0'
});

Package.registerBuildPlugin({
  name: 'transpileBabel',
  use: ['babel'],
  sources: [
    'babel-plugin.js'
  ]
});

Package.onUse(function (api) {
  // We need the Babel helpers as a run-time dependency of the generated code.
  api.imply('babel-runtime');
});
