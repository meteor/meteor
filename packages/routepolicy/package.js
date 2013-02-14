Package.describe({
  summary: "route policy declarations",
  internal: true
});

Package.on_use(function (api) {
  api.add_files('routepolicy.js', 'server');
});

Package.on_test(function (api) {
  api.add_files(['routepolicy_tests.js'], 'server');
});
