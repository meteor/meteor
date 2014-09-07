Package.describe({
  summary: "API for Persistent Storage, PubSub and Request",
  version: "1.0.0"
});

Package.on_use(function (api) {
  api.use('jquery', 'client');
  api.add_files('amplify.js', 'client');
});
