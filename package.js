Package.describe({
  name: "htmljs",
  test: "htmljs-test",
  summary: "Small library for expressing HTML trees",
  version: '1.0.0',
  internal: true
});

Package.on_use(function (api) {
  api.export('HTML');

  api.add_files(['utils.js', 'html.js', 'tohtml.js']);
});

Package.on_test(function (api) {
  api.use('htmljs');
  api.use('html-tools');
  api.use('tinytest');
  api.use('underscore');
  api.add_files(['htmljs_test.js']);
});
