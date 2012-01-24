Package.describe({
  summary: "Execute a function when the user scrolls past an element"
});

Package.on_use(function (api) {
  api.use('jquery');
  api.add_files('waypoints.js', 'client');
});
