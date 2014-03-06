
Package.describe({
  summary: "Build-time tools for template compilation"
});

Package.on_use(function (api) {
  api.use('htmljs');

  api.export('BlazeTools');

  api.add_files(['tojs.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('blaze-tools');
  // TODO
});
