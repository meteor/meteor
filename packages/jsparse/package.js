Package.describe({
  summary: "Full-featured JaavScript parser"
});

Package.on_use(function (api) {
  api.add_files([
    'parser.js',
    'lexer.js'], ['client', 'server']);
});
