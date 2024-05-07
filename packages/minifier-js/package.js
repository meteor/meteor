Package.describe({
  summary: "JavaScript minifier",
  version: "2.8.0-rc216.0"
});

Npm.depends({
  terser: "5.31.0"
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('babel-compiler');
  api.mainModule('minifier.js', 'server');
  api.export('meteorJsMinify');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('minifier-js');
  api.mainModule('minifier-tests.js', 'server');
});
