Package.describe({
  name: 'hot-module-reload',
  version: '0.1.0',
  summary: 'Update code in development without reloading the page',
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: 'hot-core',
  sources: ['plugin.js'],
  use: ['ecmascript@0.14.3'],
  npmDependencies: {
    ws: '7.2.5'
  },
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
  api.use('babel-compiler');
  api.use('modules');
  api.imply('modules-runtime-hot@0.12.0');
  api.addFiles('./client.js', 'client');
});

Package.onTest(function (api) {
});
