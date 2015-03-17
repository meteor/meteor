Package.describe({
  summary: "Provides JSON.stringify and JSON.parse for older browsers",
  version: '1.0.3'
});

// We need to figure out how to serve this file only to browsers that don't have
// JSON.stringify (eg, IE7 and earlier, and IE8 outside of "standards mode")

Package.onUse(function (api) {
  // Node always has JSON; we only need this in some browsers.
  api.export('JSON', 'client');
  api.addFiles('json_native.js', 'client');
  api.addFiles('json2.js', 'client');
});
