Package.describe({
  summary: "Compiler for Spacebars template language",
  version: '1.0.3'
});

Package.on_use(function (api) {
  api.export('SpacebarsCompiler');

  api.use('htmljs');
  api.use('html-tools');
  api.use('blaze-tools');

  api.use('underscore');
  api.use('minifiers', ['server']);
  api.add_files(['templatetag.js',
                 'optimizer.js',
                 'codegen.js',
                 'compiler.js']);
});

Package.on_test(function (api) {
  api.use('underscore');
  api.use('spacebars-compiler');
  api.use('tinytest');
  api.use('blaze-tools');
  api.use('coffeescript');
  api.add_files('spacebars_tests.js');
  api.add_files('compile_tests.js');
  api.add_files('compiler_output_tests.coffee');
});
