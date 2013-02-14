Package.describe({
  summary: "enable the application cache in the browser"
});

Package.on_use(function (api) {
  api.use('startup', 'client');
  api.use('routepolicy', 'server');
  api.add_files('appcache-client.js', 'client');
  api.add_files('appcache-server.js', 'server');
});
