Package.describe({
  summary: "Small library for expressing HTML trees",
  version: '1.0.0'
});

Package.on_use(function (api) {
  api.export('HTML');

  api.add_files(['preamble.js',
                 'visitors.js',
                 'html.js']);
});

Package.on_test(function (api) {
  api.use('htmljs');
  api.use('html-tools');
  api.use('tinytest');
  api.use('underscore');
  api.add_files(['htmljs_test.js']);
});
