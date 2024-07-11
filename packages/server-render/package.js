Package.describe({
  name: "server-render",
  version: '0.4.2-rc300.5',
  summary: "Generic support for server-side rendering in Meteor apps",
  documentation: "README.md"
});

Npm.depends({
  "combined-stream2": "1.1.2",
  "magic-string": "0.25.7",
  "stream-to-string": "1.2.0",
  "parse5": "4.0.0"
});

Package.onUse(function(api) {
  api.use("ecmascript");
  api.use("webapp");
  api.mainModule("client.js", "client", { lazy: true });
  api.mainModule("server.js", "server");
  api.addAssets('server-render.d.ts', 'server');
});

Package.onTest(function(api) {
  api.use("ecmascript");
  api.use("tinytest");
  api.use("server-render");
  api.mainModule("server-render-tests.js", "server");
});
