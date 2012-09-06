Package.describe({
  summary: "Full-featured JaavScript parser"
});

Package.on_use(function (api) {
  api.add_files(['lexer.js', 'parserlib.js', 'parser.js'],
                ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('jsparse', 'client');

  api.add_files('parser_tests.js', ['client', 'server']);
});
