
Package.describe({
  summary: "Standards-compliant HTML tools"
});

Package.on_use(function (api) {
  api.export('HTML');

  api.add_files(['scanner.js', 'charref.js', 'exports.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('html');
  api.use('underscore');
  api.add_files('charref_tests.js');
});
