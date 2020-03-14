Package.describe({
  summary: "JavaScript minifier",
  version: "2.6.0"
});

Npm.depends({
  terser: "4.4.0"
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.export(['meteorJsMinify']);
  api.addFiles(['minifier.js'], 'server');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('minifier-js');
  api.addFiles([
    'tests/minifier-tests.js',
  ], 'server');
});