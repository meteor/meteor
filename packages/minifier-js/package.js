Package.describe({
  summary: 'JavaScript minifier',
  version: '2.8.0-rc270.4',
});

Npm.depends({
  '@swc/core': '1.2.155',
});

Package.onUse(function(api) {
  api.use('ecmascript');
  api.use('babel-compiler');
  api.mainModule('minifier.js', 'server');
  api.export('meteorJsMinify');
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('minifier-js');
  api.mainModule('minifier-tests.js', 'server');
});
