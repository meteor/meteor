Package.describe({
  summary: "Run a function when the user scrolls past an element",
  version: "1.0.2-ipc.0"
});

Package.on_use(function (api) {
  api.use('jquery');
  api.use('coffeescript');
  api.add_files('waypoints.coffee', 'client');
});
