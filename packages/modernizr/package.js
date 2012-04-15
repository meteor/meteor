Package.describe({
  summary: "Modernizr Front-End Development Done Right"
});

Package.on_use(function (api) {
  api.add_files('modernizr.js', 'client');
});
