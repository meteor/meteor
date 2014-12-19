Package.describe({
  summary: "API for Persistent Storage, PubSub and Request",
  version: "1.0.0"
});

Package.onUse(function (api) {
  api.use('jquery', 'client');
  api.addFiles('amplify.js', 'client');
});
