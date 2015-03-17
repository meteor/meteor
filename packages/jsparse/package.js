Package.describe({
  summary: "Full-featured JavaScript parser",
  version: "1.0.3"
});

Package.onUse(function (api) {
  api.export(['JSLexer', 'JSParser', 'ParseNode']);
  api.addFiles(['lexer.js', 'parserlib.js', 'stringify.js', 'parser.js'],
                ['client', 'server']);
});

Package.onTest(function (api) {
  api.use(['tinytest', 'underscore']);
  api.use('jsparse', 'client');

  api.addFiles('parser_tests.js',
                // Test just on client for faster running; should run
                // identically on server.
                'client');
                //['client', 'server']);
});
