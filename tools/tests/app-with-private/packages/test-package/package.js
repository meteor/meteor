Package._transitional_registerBuildPlugin({
  name: 'addTxt',
  use: [],
  sources: ['plugin.js']
});

Package.on_use(function (api) {
  api.export('TestAsset', 'server');
  api.add_files(['test-package.js', 'test-package.txt', 'test.notregistered'], 'server');
});
