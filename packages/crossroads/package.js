Package.describe({
  summary: "Crossroads.js is a routing library inspired by URL Route/Dispatch utilities present on frameworks like Rails, ..."
});

Package.on_use(function (api) {
  api.add_files('signals.min.js', 'client');
  api.add_files('crossroads.min.js', 'client');
});
