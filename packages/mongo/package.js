// XXX We should revisit how we factor MongoDB support into (1) the
// server-side node.js driver [which you might use independently of
// livedata, after all], (2) minimongo [ditto], and (3) Collection,
// which is the class that glues the two of them to Livedata, but also
// is generally the "public interface for newbies" to Mongo in the
// Meteor universe. We want to allow the components to be used
// independently, but we don't want to overwhelm the user with
// minutiae.

Package.describe({
  summary: "Adaptor for using MongoDB and Minimongo over DDP",
  version: "2.1.3",
});

Npm.depends({
  "mongodb-uri": "0.9.7",
  "lodash.times": "4.3.2",
  "lodash.isempty": "4.4.0",
  "lodash.has": "4.5.2",
  "lodash.throttle": "4.1.1",
  "lodash.once": "4.1.1",
  "lodash.isobject": "3.0.2",
  "lodash.clone": "4.5.0",
});

Npm.strip({
  mongodb: ["test/"],
});

Package.onUse(function (api) {
  api.use("npm-mongo", "server");
  api.use("allow-deny");

  api.use([
    "random",
    "ejson",
    "minimongo",
    "ddp",
    "tracker",
    "diff-sequence",
    "mongo-id",
    "check",
    "ecmascript",
    "typescript",
    "mongo-dev-server",
    "logging",
  ]);

  // Make weak use of Decimal type on client
  api.use("mongo-decimal", "client", { weak: true });
  api.use("mongo-decimal", "server");
  //api.use('emitter-promise', 'server');

  // Binary Heap data structure is used to optimize oplog observe driver
  // performance.
  api.use("binary-heap", "server");

  // Allow us to detect 'insecure'.
  api.use("insecure", { weak: true });

  // Allow us to detect 'autopublish', and publish collections if it's loaded.
  api.use("autopublish", "server", { weak: true });

  // Allow us to detect 'disable-oplog', which turns off oplog tailing for your
  // app even if it's configured in the environment. (This package will be
  // probably be removed before 1.0.)
  api.use("disable-oplog", "server", { weak: true });

  // defaultRemoteCollectionDriver gets its deployConfig from something that is
  // (for questionable reasons) initialized by the webapp package.
  api.use("webapp", "server", { weak: true });

  // If the facts package is loaded, publish some statistics.
  api.use("facts-base", "server", { weak: true });

  api.use("callback-hook", "server");

  // Stuff that should be exposed via a real API, but we haven't yet.
  api.export("MongoInternals", "server");

  api.export("Mongo");
  api.export("ObserveMultiplexer", "server", { testOnly: true });

  api.addFiles(
    [
      "mongo_driver.js",
      "oplog_tailing.ts",
      "observe_multiplex.ts",
      "doc_fetcher.js",
      "polling_observe_driver.ts",
      "oplog_observe_driver.js",
      "oplog_v2_converter.ts",
      "cursor_description.ts",
      "mongo_connection.js",
      "mongo_common.js",
      "asynchronous_cursor.js",
      "cursor.ts",
    ],
    "server"
  );
  api.addFiles("local_collection_driver.js", ["client", "server"]);
  api.addFiles("remote_collection_driver.ts", "server");
  api.addFiles("collection/collection.js", ["client", "server"]);
  api.addFiles("connection_options.ts", "server");
  // For zodern:types to pick up our published types.
  // Both the .d.ts file and package-types.json must be published
  api.addAssets("mongo.d.ts", "server");
  api.addAssets("package-types.json", "server");
});

Package.onTest(function (api) {
  api.use("mongo");
  api.use("check");
  api.use("ecmascript");
  api.use("npm-mongo", "server");
  api.use([
    "tinytest",
    "test-helpers",
    "ejson",
    "random",
    "ddp",
    "base64",
    "typescript",
  ]);
  // XXX test order dependency: the allow_tests "partial allow" test
  // fails if it is run before mongo_livedata_tests.
  api.addFiles("tests/mongo_livedata_tests.js", ["client", "server"]);
  api.addFiles("tests/upsert_compatibility_test.js", "server");
  api.addFiles("tests/allow_tests.js", ["client", "server"]);
  api.addFiles("tests/collection_tests.js", ["client", "server"]);
  api.addFiles("tests/collection_async_tests.js", ["client", "server"]);
  api.addFiles("tests/observe_changes_tests.js", ["client", "server"]);
  api.addFiles("tests/oplog_tests.js", "server");
  api.addFiles("tests/oplog_v2_converter_tests.js", "server");
  api.addFiles("tests/doc_fetcher_tests.js", "server");
});
