Package.describe({
  summary: "Provides reactive device orientation on desktop and mobile.",
  version: "1.0.0"
});

Cordova.depends({
  "org.apache.cordova.device-orientation": "0.3.8"
});

Package.on_use(function (api) {
  api.use(["deps", "underscore"]);

  api.add_files(["compass.js"], "client");

  api.export("Compass", "client");
});