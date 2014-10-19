Package.describe({
  summary: "Compile-time tools for Blaze",
  version: '1.0.1'
});

Package.on_use(function (api) {
  api.export('BlazeTools');

  api.use('htmljs');
  api.use('underscore');

  api.add_files(['preamble.js',
                 'tokens.js',
                 'tojs.js']);
});

Package.on_test(function (api) {
  api.use('blaze-tools');
  api.use('tinytest');
  api.use('underscore');
  api.use('html-tools');

  api.add_files(['token_tests.js']);
});
