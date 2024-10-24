Package.describe({
  summary: "Utility functions for tests",
  version: "2.0.1",
});

Npm.depends({
  'lodash.isequal': '4.5.0',
})

Package.onUse(function (api) {
  api.use([
    "ecmascript",
    "tracker",
    "ejson",
    "tinytest",
    "random",
    "blaze",
  ]);

  // XXX for connection.js. Not sure this really belongs in
  // test-helpers. It probably would be better off in livedata. But it's
  // unclear how to put it in livedata so that it can both be used by
  // other package tests and not included in the non-test bundle. One
  // idea would be to make a new separate package 'ddp-test-helpers' or
  // the like.
  api.use("ddp");

  api.export([
    "pollUntil",
    "try_all_permutations",
    "SeededRandom",
    "clickElement",
    "blurElement",
    "focusElement",
    "simulateEvent",
    "getStyleProperty",
    "canonicalizeHtml",
    "renderToDiv",
    "clickIt",
    "withCallbackLogger",
    "testAsyncMulti",
    "simplePoll",
    "runAndThrowIfNeeded",
    "DomUtils",
    "mockBehaviours",
    "waitUntil",
    "makeTestConnection",
    "createTestConnectionPromise",
    "captureConnectionMessages",
    "captureConnectionMessagesClient",
  ]);

  api.addFiles("try_all_permutations.js");
  api.addFiles("async_multi.js");
  api.addFiles("event_simulation.js");
  api.addFiles("seeded_random.js");
  api.addFiles("canonicalize_html.js");
  api.addFiles("render_div.js");
  api.addFiles("current_style.js");
  api.addFiles("callback_logger.js");
  api.addFiles("mock.js");
  api.addFiles("wait.js");
  api.addFiles("domutils.js", "client");
  api.addFiles("connection_server.js", "server");
  api.addFiles("connection_client.js", "client");
});

Package.onTest(function (api) {
  api.use("tinytest");
  api.use(["test-helpers"]);
  api.addFiles("try_all_permutations_test.js", "client");
  api.addFiles("seeded_random_test.js");
});
