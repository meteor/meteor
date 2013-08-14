Package.describe({
  summary: "Full-featured JavaScript parser",
  internal: true
});

Package.on_use(function (api) {
  api.export(['JSLexer', 'JSParser', 'ParseNode']);
  api.add_files(['lexer.js', 'parserlib.js', 'stringify.js', 'parser.js'],
                ['client', 'server']);
});

Package.on_test(function (api) {
  api.use(['tinytest', 'underscore']);
  api.use('jsparse', 'client');

  api.add_files('parser_tests.js',
                // Test just on client for faster running; should run
                // identically on server.
                'client');
                //['client', 'server']);
});
