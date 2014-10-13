Package.describe({
  name: '~name~',
  summary: ' /* Fill me in! */ ',
  version: '1.0.0',
  git: ' /* Fill me in! */ '
});

Package.onUse(function(api) {
~cc~  api.versionsFrom('~release~');
  api.addFiles('~name~.js');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('~name~');
  api.addFiles('~name~-tests.js');
});
