Package.describe({
  summary: "Run a function when the user scrolls past an element",
  version: "1.0.9",
  git: 'https://github.com/meteor/meteor/tree/master/packages/jquery-waypoints'
});

Package.onUse(function (api) {
  api.use('jquery');
  api.use('coffeescript');
  api.addFiles('waypoints.coffee', 'client');
});
