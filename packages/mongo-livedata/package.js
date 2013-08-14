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
  internal: true
});

Npm.depends({mongodb: "1.3.19"});

Package.on_use(function (api) {
  api.use(['random', 'ejson', 'json', 'underscore', 'minimongo', 'logging',
           'livedata', 'deps', 'application-configuration'],
          ['client', 'server']);
  api.use('check', ['client', 'server']);

  // Allow us to detect 'insecure'.
  api.use('insecure', {weak: true});

  // Allow us to detect 'autopublish', and publish collections if it's loaded.
  api.use('autopublish', 'server', {weak: true});

  // defaultRemoteCollectionDriver gets its deployConfig from something that is
  // (for questionable reasons) initialized by the webapp package.
  api.use('webapp', 'server', {weak: true});

  // If the facts package is loaded, publish some statistics.
  api.use('facts', 'server', {weak: true});

  // Stuff that should be exposed via a real API, but we haven't yet.
  api.export('MongoInternals', 'server');
  // For tests only.
  api.export('MongoTest', 'server');

  api.add_files('mongo_driver.js', 'server');
  api.add_files('local_collection_driver.js', ['client', 'server']);
  api.add_files('remote_collection_driver.js', 'server');
  api.add_files('collection.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('mongo-livedata');
  api.use('check');
  api.use(['tinytest', 'underscore', 'test-helpers', 'ejson', 'random',
           'livedata']);
  // XXX test order dependency: the allow_tests "partial allow" test
  // fails if it is run before mongo_livedata_tests.
  api.add_files('mongo_livedata_tests.js', ['client', 'server']);
  api.add_files('allow_tests.js', ['client', 'server']);
  api.add_files('collection_tests.js', ['client', 'server']);
  api.add_files('observe_changes_tests.js', ['client', 'server']);
  api.add_files('oplog_tests.js', 'server');
});
