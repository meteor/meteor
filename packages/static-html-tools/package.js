Package.describe({
  name: 'static-html-tools',
  summary: "Tools for static-html",
  version: '1.0.0',
  git: 'https://github.com/meteor/meteor.git'
});

Npm.depends({
  'lodash.isempty': '4.4.0'
});

Package.onUse(function(api) {
  api.use([
    'ecmascript@0.16.2',
    'caching-compiler@1.2.2'
  ]);

  api.export('TemplatingTools');

  api.mainModule('templating-tools.js');
});

Package.onTest(function(api) {
  api.use([
    'tinytest@1.1.0',
    'ecmascript@0.15.1'
  ]);

  api.use([
    'templating-tools'
  ]);

  api.addFiles([
    'html-scanner-tests.js'
  ], 'server');
});
