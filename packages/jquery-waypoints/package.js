Package.describe({
  summary: "Run a function when the user scrolls past an element"
});

Package.on_use(function (api) {
  api.use('jquery');
  api.use('coffeescript');
  api.add_files('waypoints.coffee', 'client');
});
