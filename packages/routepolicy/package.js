Package.describe({
  summary: "route policy declarations",
  internal: true
});

Package.on_use(function (api) {
  api.use('webapp', 'server');
  api.use('underscore', 'server');
  api.add_files('routepolicy.js', 'server');
});

Package.on_test(function (api) {
  api.use(['routepolicy', 'tinytest']);
  api.add_files(['routepolicy_tests.js'], 'server');
});
