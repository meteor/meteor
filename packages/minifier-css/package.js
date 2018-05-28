Package.describe({
  summary: 'CSS minifier',
  version: '1.3.1'
});

Npm.depends({
  postcss: '6.0.13',
  cssnano: '3.10.0'
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
