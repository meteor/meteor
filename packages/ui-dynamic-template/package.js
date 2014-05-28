Package.describe({
  summary: "Component for dynamically rendering templates",
  internal: true
});

Package.on_use(function (api) {
  api.use('templating');
  api.use('underscore');
  api.add_files(['dynamic.html', 'dynamic.js'], 'client');
});

Package.on_test(function (api) {
  api.use(["ui-dynamic-template", "tinytest", "test-helpers"]);
  api.use("templating", "client");
  api.add_files(["dynamic_tests.html", "dynamic_tests.js"], "client");
});
