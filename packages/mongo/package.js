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
  version: '1.1.0'
});

Npm.depends({
  // 1.4.32 (and bson 0.2.18) with optional native dependencies (bson native
  // piece and kerberos) ripped out, which means we don't have to do the
  // publish-for-arch dance every time we make a Meteor release.
  // XXX move the npm dependency into a non-core versioned package and allow
  //     it to use C++ bson
  mongodb: "https://github.com/meteor/node-mongodb-native/tarball/634759e6326dc19a228df66ddb309285532f3b8a",
  "mongodb-uri": "0.9.7"
});

Npm.strip({
  mongodb: ["test/"]
});

Package.onUse(function (api) {
  api.use(['random', 'ejson', 'json', 'underscore', 'minimongo', 'logging',
           'ddp', 'tracker'],
          ['client', 'server']);
  api.use('check', ['client', 'server']);

  // Binary Heap data structure is used to optimize oplog observe driver
  // performance.
  api.use('binary-heap', 'server');

  // Allow us to detect 'insecure'.
  api.use('insecure', {weak: true});

  // Allow us to detect 'autopublish', and publish collections if it's loaded.
  api.use('autopublish', 'server', {weak: true});

  // Allow us to detect 'disable-oplog', which turns off oplog tailing for your
  // app even if it's configured in the environment. (This package will be
  // probably be removed before 1.0.)
  api.use('disable-oplog', 'server', {weak: true});

  // defaultRemoteCollectionDriver gets its deployConfig from something that is
  // (for questionable reasons) initialized by the webapp package.
  api.use('webapp', 'server', {weak: true});

  // If the facts package is loaded, publish some statistics.
  api.use('facts', 'server', {weak: true});

  api.use('callback-hook', 'server');

  // Stuff that should be exposed via a real API, but we haven't yet.
  api.export('MongoInternals', 'server');
  // For tests only.
  api.export('MongoTest', 'server', {testOnly: true});
  api.export("Mongo");

  api.addFiles(['mongo_driver.js', 'oplog_tailing.js',
                 'observe_multiplex.js', 'doc_fetcher.js',
                 'polling_observe_driver.js','oplog_observe_driver.js'],
                'server');
  api.addFiles('local_collection_driver.js', ['client', 'server']);
  api.addFiles('remote_collection_driver.js', 'server');
  api.addFiles('collection.js', ['client', 'server']);
});

Package.onTest(function (api) {
  api.use('mongo');
  api.use('check');
  api.use(['tinytest', 'underscore', 'test-helpers', 'ejson', 'random',
           'ddp', 'base64']);
  // XXX test order dependency: the allow_tests "partial allow" test
  // fails if it is run before mongo_livedata_tests.
  api.addFiles('mongo_livedata_tests.js', ['client', 'server']);
  api.addFiles('allow_tests.js', ['client', 'server']);
  api.addFiles('collection_tests.js', ['client', 'server']);
  api.addFiles('observe_changes_tests.js', ['client', 'server']);
  api.addFiles('oplog_tests.js', 'server');
  api.addFiles('doc_fetcher_tests.js', 'server');
});
