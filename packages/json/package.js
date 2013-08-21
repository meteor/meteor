Package.describe({
  summary: "Provides JSON.stringify and JSON.parse for older browsers",
  internal: true
});

// We need to figure out how to serve this file only to browsers that don't have
// JSON.stringify (eg, IE7 and earlier, and IE8 outside of "standards mode")

Package.on_use(function (api) {
  // Node always has JSON; we only need this in some browsers.
  api.export('JSON', 'client');
  api.add_files('json_native.js', 'client');
  api.add_files('json2.js', 'client');
});
