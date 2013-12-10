
Package.describe({
  summary: "Standards-compliant HTML tools"
});

Package.on_use(function (api) {
  api.use('htmljs');
  api.imply('htmljs');

  api.add_files(['scanner.js',
                 'charref.js',
                 'tokenize.js',
                 'parse.js',
                 'exports.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('html');
  api.use('underscore');
  api.use('ui'); // for `toCode`
  api.add_files(['charref_tests.js',
                 'tokenize_tests.js',
                 'parse_tests.js',
                 'utils_tests.js']);
});
