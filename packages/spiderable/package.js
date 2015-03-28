Package.describe({
  summary: "Makes the application crawlable to web spiders",
  version: "1.0.7"
});

Package.onUse(function (api) {
  api.use('webapp', 'server');
  api.use(['templating'], 'client');
  api.use(['underscore'], ['client', 'server']);

  api.export('Spiderable');

  api.addFiles('spiderable.html', 'client');
  api.addFiles('spiderable.js', ['client', 'server']);
  api.addFiles('spiderable_server.js', 'server');
  api.addFiles('spiderable_client.js', 'client');

  api.addFiles('phantom_script.js', 'server', { isAsset: true });
});

Package.onTest(function (api) {
  api.use(['spiderable', 'tinytest']);
  api.addFiles('spiderable_tests.js', 'server');
});
