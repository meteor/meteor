Package.describe({
  summary: "Makes the application crawlable to web spiders",
  version: "1.0.4"
});

Package.on_use(function (api) {
  api.use('webapp', 'server');
  api.use(['templating'], 'client');
  api.use(['underscore'], ['client', 'server']);

  api.export('Spiderable');

  api.add_files('spiderable.html', 'client');
  api.add_files('spiderable.js', ['client', 'server']);
  api.add_files('spiderable_server.js', 'server');
  api.add_files('spiderable_client.js', 'client');

  api.add_files('phantom_script.js', 'server', { isAsset: true });
});

Package.on_test(function (api) {
  api.use(['spiderable', 'tinytest']);
  api.add_files('spiderable_tests.js', 'server');
});
