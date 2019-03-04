Package.describe({
  summary: 'CSS minifier',
  version: '1.4.1'
});

Npm.depends({
  postcss: '7.0.5',
  cssnano: '4.1.7'
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
