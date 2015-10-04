Package.describe({
  summary: "Makes the application crawlable to web spiders",
  version: "1.0.9"
});

Package.onUse(function (api) {
  api.use('webapp', 'server');
  api.use(['ddp', 'tracker'], 'client');
  api.use(['callback-hook'], 'client');
  api.use(['templating'], 'client');
  api.use(['underscore'], ['client', 'server']);

  api.export('Spiderable');

  api.addFiles('spiderable.html', 'client');
  api.addFiles('spiderable.js', ['client', 'server']);
  api.addFiles('spiderable_server.js', 'server');
  api.addFiles('spiderable_client.js', 'client');

  api.addAssets('phantom_script.js', 'server');
});

Package.onTest(function (api) {
  api.use(['spiderable', 'tinytest', 'underscore', 'ddp']);
  api.addFiles('spiderable_client_tests.js', 'client');
  api.addFiles('spiderable_server_tests.js', 'server');
});
