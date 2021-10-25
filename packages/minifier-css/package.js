Package.describe({
  summary: 'CSS minifier',
  version: '1.6.0'
});

Npm.depends({
  postcss: '8.3.5',
  cssnano: '4.1.11'
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
