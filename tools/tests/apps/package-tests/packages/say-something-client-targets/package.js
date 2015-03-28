Package.describe({
  version: "1.0.0",
  summary: "prints to console, depending on which client arch we build for"
});

Package.onUse(function (api) {
  api.addFiles('all-clients.js', ['client']);
  api.addFiles('browser-client.js', ['web.browser']);
  api.addFiles('cordova-client.js', ['web.cordova']);
  api.addFiles('server.js', ['server']);
});
