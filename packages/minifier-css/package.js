Package.describe({
  summary: 'CSS minifier',
  version: '1.4.2'
});

Npm.depends({
  postcss: '7.0.14',
  cssnano: '4.1.9'
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
    'urlrewriting-tests.js'
  ], 'server');
});
