Package.describe({
  summary: "Makes the application crawlable to web spiders."
});

Package.on_use(function (api) {
  api.use(['templating'], 'client');

  api.add_files('spiderable.html', 'client');
  api.add_files('spiderable.js', 'server');
});
