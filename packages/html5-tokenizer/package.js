
Package.describe({
  summary: "HTML5 tokenizer"
});

Npm.depends({'html5': "0.3.10"});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];

  api.add_files(['entities.js', 'constants.js', 'buffer.js',
                 'events.js', 'tokenizer.js'], where);
});

Package.on_test(function (api) {
  api.use('html5-tokenixer');
  api.use('tinytest');
  api.add_files('tokenizer_tests.js', ['client', 'server']);
});
