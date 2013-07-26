Package.describe({
  summary: "route policy declarations",
  internal: true
});

Package.on_use(function (api) {
  api.use('underscore', 'server');
  // Resolve circular dependency with webapp. We can only use WebApp via
  // Package.webapp and only after initial load.
  api.use('webapp', 'server', {unordered: true});
  api.export('RoutePolicy', 'server');
  api.export('RoutePolicyTest', 'server', {testOnly: true});
  api.add_files('routepolicy.js', 'server');
});

Package.on_test(function (api) {
  api.use(['routepolicy', 'tinytest']);
  api.add_files(['routepolicy_tests.js'], 'server');
});
