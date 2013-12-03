Package.describe({
  summary: "Enable the application cache in the browser"
});

Package.on_use(function (api) {
  api.use('webapp', 'server');
  api.use('reload', 'client');
  api.use('routepolicy', 'server');
  api.use('underscore', 'server');
  api.use('autoupdate', 'server', {weak: true});
  api.add_files('appcache-client.js', 'client');
  api.add_files('appcache-server.js', 'server');
});
