Package.describe({
  summary: "Full-featured JaavScript parser"
});

Package.on_use(function (api) {
  api.add_files(['lexer.js', 'parserlib.js', 'parser.js'],
                ['client', 'server']);
});
