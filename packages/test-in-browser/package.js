Package.describe({
  summary: "Run tests interactively in the browser",
  internal: true
});

Package.on_use(function (api) {

  api.use(['liveui', 'livedata', 'templating'], 'client');

  api.add_files([
    'driver.css',
    'driver.html',
    'driver.js'
  ], "client");
});
