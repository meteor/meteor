Package.describe({
  summary: "Makes the application crawlable to web spiders"
});

Package.on_use(function (api) {
  api.use('webapp', 'server');
  api.use(['templating'], 'client');
  api.use(['underscore'], ['client', 'server']);

  api.export('Spiderable', 'server');

  api.add_files('spiderable.html', 'client');
  api.add_files('spiderable.js', 'server');
});

Package.on_test(function (api) {
  api.use(['spiderable', 'tinytest']);
  api.add_files('spiderable_tests.js', 'server');
});
