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
  version: '1.1.12_2'
});

Npm.depends({
  "mongodb-uri": "0.9.7"
});

Npm.strip({
  mongodb: ["test/"]
});

Package.onUse(function (api) {
  api.use('npm-mongo@1.5.48_1', 'server');
  api.use('allow-deny@1.0.5');

  api.use([
    'random@1.0.10',
    'ejson@1.0.12',
    'underscore@1.0.9',
    'minimongo@1.0.17',
    'ddp@1.2.5',
    'tracker@1.1.0',
    'diff-sequence@1.0.6',
    'mongo-id@1.0.5',
    'check@1.2.3',
    'ecmascript@0.5.8'
  ]);

  // Binary Heap data structure is used to optimize oplog observe driver
  // performance.
  api.use('binary-heap@1.0.9', 'server');

  // Allow us to detect 'insecure'.
  api.use('insecure@1.0.7', {weak: true});

  // Allow us to detect 'autopublish', and publish collections if it's loaded.
  api.use('autopublish@1.0.7', 'server', {weak: true});

  // Allow us to detect 'disable-oplog', which turns off oplog tailing for your
  // app even if it's configured in the environment. (This package will be
  // probably be removed before 1.0.)
  api.use('disable-oplog@1.0.7', 'server', {weak: true});

  // defaultRemoteCollectionDriver gets its deployConfig from something that is
  // (for questionable reasons) initialized by the webapp package.
  api.use('webapp@1.3.11', 'server', {weak: true});

  // If the facts package is loaded, publish some statistics.
  api.use('facts@1.0.9', 'server', {weak: true});

  api.use('callback-hook@1.0.9', 'server');

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
  api.addFiles('connection_options.js', 'server');
});

Package.onTest(function (api) {
  api.use('mongo');
  api.use('check');
  api.use(['tinytest', 'underscore', 'test-helpers', 'ejson', 'random',
           'ddp', 'base64']);
  // XXX test order dependency: the allow_tests "partial allow" test
  // fails if it is run before mongo_livedata_tests.
  api.addFiles('mongo_livedata_tests.js', ['client', 'server']);
  api.addFiles('upsert_compatibility_test.js', 'server');
  api.addFiles('allow_tests.js', ['client', 'server']);
  api.addFiles('collection_tests.js', ['client', 'server']);
  api.addFiles('observe_changes_tests.js', ['client', 'server']);
  api.addFiles('oplog_tests.js', 'server');
  api.addFiles('doc_fetcher_tests.js', 'server');
});
