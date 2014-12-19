Package.describe({
  version: "1.0.0"
});

Package.registerBuildPlugin({
  name: 'addTxt',
  use: [],
  sources: ['plugin.js']
});

Package.onUse(function (api) {
  api.export('TestAsset', 'server');
  api.addFiles(['test-package.js', 'test-package.txt', 'test.notregistered'], 'server');
});
