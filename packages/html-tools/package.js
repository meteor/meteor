Package.describe({
  summary: "Standards-compliant HTML tools",
  version: '1.0.4'
});

Package.onUse(function (api) {
  api.use('htmljs');
  api.imply('htmljs');

  api.export('HTMLTools');

  api.addFiles(['utils.js',
                 'scanner.js',
                 'charref.js',
                 'tokenize.js',
                 'templatetag.js',
                 'parse.js']);
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('html-tools');
  api.use('underscore');
  api.use('htmljs');
  api.use('blaze-tools'); // for `toJS`
  api.addFiles(['charref_tests.js',
                 'tokenize_tests.js',
                 'parse_tests.js']);
});
