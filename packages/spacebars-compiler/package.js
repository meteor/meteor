Package.describe({
  summary: "Compiler for Spacebars template language",
  version: '1.0.7'
});

Package.onUse(function (api) {
  api.export('SpacebarsCompiler');

  api.use('htmljs');
  api.use('html-tools');
  api.use('blaze-tools');

  api.use('underscore');
  // The templating plugin will pull in minifiers, so that generated code will
  // be beautified. But it's a weak dependency so that eg boilerplate-generator
  // doesn't pull in minifiers.
  api.use('minifiers', ['server'], { weak: true });
  api.addFiles(['templatetag.js',
                 'optimizer.js',
                 'react.js',
                 'codegen.js',
                 'compiler.js']);
});

Package.onTest(function (api) {
  api.use([
    'underscore',
    'spacebars-compiler',
    'tinytest',
    'blaze-tools',
    'coffeescript',
    'spacebars',
    'blaze'
  ]);
  api.addFiles('spacebars_tests.js');
  api.addFiles('compile_tests.js');
  api.addFiles('compiler_output_tests.coffee');
});
