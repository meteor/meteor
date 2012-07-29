Package.describe({
  summary: "Code for oauth1 clients",
});

Package.on_use(function (api) {
  api.add_files('oauth1.js', 'server');
});

Package.on_test(function (api) {
  // XXX Add some!
});
