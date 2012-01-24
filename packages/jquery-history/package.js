Package.describe({
  summary: "pushState module from the jQuery project"
});

Package.on_use(function (api) {
  api.use('jquery');
  api.add_files('jquery.history.js', 'client');
});
