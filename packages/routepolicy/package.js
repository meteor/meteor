Package.describe({
  summary: "route policy declarations",
  version: '1.0.6'
});

Package.onUse(function (api) {
  api.use('underscore', 'server');
  // Resolve circular dependency with webapp. We can only use WebApp via
  // Package.webapp and only after initial load.
  api.use('webapp', 'server', {unordered: true});
  api.export('RoutePolicy', 'server');
  api.export('RoutePolicyTest', 'server', {testOnly: true});
  api.addFiles('routepolicy.js', 'server');
});

Package.onTest(function (api) {
  api.use(['routepolicy', 'tinytest']);
  api.addFiles(['routepolicy_tests.js'], 'server');
});
