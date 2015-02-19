Package.describe({
  summary: "Run a function when the user scrolls past an element",
  version: "1.0.3-winr.2"
});

Package.onUse(function (api) {
  api.use('jquery');
  api.use('coffeescript');
  api.export('Waypoint', 'client');
  api.addFiles('waypoints.coffee', 'client');
});
