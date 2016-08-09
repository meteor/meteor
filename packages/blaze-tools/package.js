Package.describe({
  summary: "Compile-time tools for Blaze",
  version: '1.0.9',
  git: 'https://github.com/meteor/meteor/tree/master/packages/blaze-tools'
});

Package.onUse(function (api) {
  api.export('BlazeTools');

  api.use('htmljs');
  api.use('underscore');

  api.addFiles(['preamble.js',
                 'tokens.js',
                 'tojs.js']);
});

Package.onTest(function (api) {
  api.use('blaze-tools');
  api.use('tinytest');
  api.use('underscore');
  api.use('html-tools');

  api.addFiles(['token_tests.js']);
});
