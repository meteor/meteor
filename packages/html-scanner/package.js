Package.describe({
  name: 'html-scanner',
  version: '1.0.0',
  summary: 'Scan and extract HTML tags',
  git: 'https://github.com/meteor/meteor.git',
  documentation: 'README.md'
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.mainModule('html-scanner.js');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('templating-tools');
  api.use('html-scanner');
  api.mainModule('html-scanner-tests.js', 'server');
});
