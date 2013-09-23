
Package.describe({
  summary: "JavaScript-like expression compiler for templates"
});

Package.on_use(function (api) {
  api.export('RExpr');
  api.add_files(['constants.js', 'utils.js', 'parse.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('rexpr');
  api.add_files('rexpr_tests.js');
});
