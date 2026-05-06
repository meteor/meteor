Package.describe({
  summary: 'CSS minifier',
  version: '2.0.2',
});

Npm.depends({
  postcss: '8.5.13',
  cssnano: '7.1.9',
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.mainModule('minifier.js', 'server');
  api.export('CssTools');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.addFiles([
    'minifier-tests.js',
    'minifier-async-tests.js',
    'urlrewriting-tests.js'
  ], 'server');
});
