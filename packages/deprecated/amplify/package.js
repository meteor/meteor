Package.describe({
  summary: "API for Persistent Storage, PubSub and Request",
  version: "1.0.0",
  deprecated: true,
  documentation: null
});

Package.onUse(function (api) {
  api.use('jquery', 'client');
  api.addFiles('amplify.js', 'client');
});
