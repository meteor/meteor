Package.describe({
  // These tests are in a separate package so that we can Npm.depend on
  // parse5, a html parsing library.
  summary: "Tests for the boilerplate-generator package",
  version: '1.5.2',
  documentation: null
});

Npm.depends({
  parse5: '6.0.1'
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use([
    'tinytest',
    'boilerplate-generator'
  ], 'server');
  api.addFiles('web.browser-tests.js', 'server');
  api.addFiles('web.cordova-tests.js', 'server');
});
