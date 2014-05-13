Package.describe({
  summary: "JavaScript pattern for classes and inheritance",
  internal: true
});

Package.on_use(function (api) {
  api.export('JSClass');
  api.add_files(['jsclass.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('jsclass');
  //api.add_files('jsclass_tests.js');
});
