Package.describe({
  summary: "JavaScript pattern for classes and inheritance",
  internal: true
});

Package.on_use(function (api) {
  api.export('Classes');
  api.add_files(['classes.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('classes');
  api.add_files('classes_tests.js');
});
