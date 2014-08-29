Package.describe({
  summary: "Provides reactive geolocation on desktop and mobile.",
  version: "1.0.0-cordova2"
});

Cordova.depends({
  "org.apache.cordova.geolocation": "0.3.9"
});

Package.on_use(function (api) {
  api.use(["deps"]);

  api.add_files(["geolocation.js"], "client");

  api.export("Geolocation", "client");
});