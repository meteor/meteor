Package.describe({
  summary: "API for Persistant Storage, PubSub and Request"
});

Package.on_use(function (api) {
  api.add_files('amplify.js', 'client');
});
