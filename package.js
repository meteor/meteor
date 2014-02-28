
Package.describe({
  summary: "Standards-compliant HTML tools"
});

Package.on_use(function (api) {
  // we attach stuff to the global symbol `HTML`, exported
  // by `htmljs`, so we both use and effectively imply it.
  api.use('htmljs');
  api.imply('htmljs');

  api.export('HTMLTools');

  api.add_files(['utils.js',
                 'scanner.js',
                 'charref.js',
                 'tokenize.js',
                 'parse.js',
                 'exports.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('html-tools');
  api.use('underscore');
  api.use('spacebars-compiler'); // for `HTML.toJS`
  api.add_files(['charref_tests.js',
                 'tokenize_tests.js',
                 'parse_tests.js']);
});
