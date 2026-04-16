Package.describe({
  summary: "Session variable",
  version: "1.2.2",
});

Package.onUse(function (api) {
  api.use(['ecmascript', 'reactive-dict'], 'client');

  // Session can work with or without reload, but if reload is present
  // it should load first so we can detect it at startup and populate
  // the session.
  api.use("reload", "client", { weak: true });

  api.export("Session", "client");
  api.mainModule("session.js", "client");
  api.addAssets("session.d.ts", "server");
});

Package.onTest(function (api) {
  api.use("ecmascript");
  api.use("tinytest");
  api.use("session", "client");
  api.use("reactive-dict", "client");
  api.use("tracker");
  api.use("mongo");
  api.addFiles("session_tests.js", "client");
});
