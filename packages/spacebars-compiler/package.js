Package.describe({
  summary: "Compiler for Spacebars template language",
  version: '1.0.4'
});

Package.onUse(function (api) {
  api.export('SpacebarsCompiler');

  api.use('htmljs');
  api.use('html-tools');
  api.use('blaze-tools');

  api.use('underscore');
  api.use('minifiers', ['server']);
  api.addFiles(['templatetag.js',
                 'optimizer.js',
                 'codegen.js',
                 'compiler.js']);
});

Package.onTest(function (api) {
  api.use('underscore');
  api.use('spacebars-compiler');
  api.use('tinytest');
  api.use('blaze-tools');
  api.use('coffeescript');
  api.addFiles('spacebars_tests.js');
  api.addFiles('compile_tests.js');
  api.addFiles('compiler_output_tests.coffee');
});
