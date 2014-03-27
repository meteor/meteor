Package.describe({
  summary: "HTML5 tokenizer"
});

Package.on_use(function (api) {
  api.export('HTML5Tokenizer');
  api.add_files(['entities.js', 'constants.js', 'buffer.js',
                 'events.js', 'tokenizer.js',
                 'html5_tokenizer.js']);
});

Package.on_test(function (api) {
  api.use('html5-tokenizer');
  api.use('tinytest');
  api.add_files('tokenizer_tests.js', ['server']);
});
