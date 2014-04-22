Package.describe({
  summary: "Compiler for Spacebars template language"
});

Package.on_use(function (api) {
  // (TODO: make SpacebarsCompiler a separate symbol)

  api.use('spacebars');
  api.imply('spacebars');

  api.use('htmljs');
  api.use('html-tools');
  api.use('blaze-tools');

  api.use('underscore');
  api.use('ui');
  api.use('minifiers', ['server']);
  api.add_files(['templatetag.js', 'spacebars-compiler.js']);
});

Package.on_test(function (api) {
  api.use('underscore');
  api.use('spacebars-compiler');
  api.use('tinytest');
  api.add_files('spacebars_tests.js');
  api.add_files('compile_tests.js');
  api.add_files('token_tests.js');
});
