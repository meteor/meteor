Package._transitional_registerBuildPlugin({
  name: 'addTxt',
  use: [],
  sources: ['plugin.js']
});

Package.on_use(function (api) {
  api.add_files(['test-package.js', 'test-package.txt'], 'server');
});
