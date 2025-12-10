Package.describe({
  name: 'static-html-tools',
  summary: "Tools for static-html",
  version: '1.0.0',
  git: 'https://github.com/meteor/meteor.git',
  documentation: null
});

Npm.depends({
  'lodash.isempty': '4.4.0'
});

Package.onUse(function(api) {
  api.use([
    'ecmascript',
    'caching-compiler'
  ]);

  api.export('TemplatingTools');

  api.mainModule('templating-tools.js');
});

Package.onTest(function(api) {
  api.use([
    'tinytest',
    'ecmascript'
  ]);

  api.use([
    'templating-tools'
  ]);

  api.addFiles([
    'html-scanner-tests.js'
  ], 'server');
});
