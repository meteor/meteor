Package.describe({
  summary: "route policy declarations",
  version: '1.0.13'
});

Package.onUse(function (api) {
  api.use(['underscore', 'ecmascript'], 'server');
  // Resolve circular dependency with webapp. We can only use WebApp via
  // Package.webapp and only after initial load.
  api.use('webapp', 'server', {unordered: true});
  api.export('RoutePolicy', 'server');
  api.mainModule('main.js', 'server');
});

Package.onTest(function (api) {
  api.use(['routepolicy', 'tinytest', 'ecmascript']);
  api.mainModule('routepolicy_tests.js', 'server');
});
