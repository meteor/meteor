
Package.describe({
  summary: "Standards-compliant HTML tools",
  internal: true
});

Package.on_use(function (api) {
  api.use('htmljs');
  api.imply('htmljs');

  api.export('HTMLTools');

  api.add_files(['utils.js',
                 'scanner.js',
                 'charref.js',
                 'tokenize.js',
                 'templatetag.js',
                 'parse.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('html-tools');
  api.use('underscore');
  api.use('blaze-tools'); // for `toJS`
  api.add_files(['charref_tests.js',
                 'tokenize_tests.js',
                 'parse_tests.js']);
});
