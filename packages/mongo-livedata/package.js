// XXX We should revisit how we factor MongoDB support into (1) the
// server-side node.js driver [which you might use independently of
// livedata, after all], (2) minimongo [ditto], and (3) Collection,
// which is the class that glues the two of them to Livedata, but also
// is generally the "public interface for newbies" to Mongo in the
// Meteor universe. We want to allow the components to be used
// independently, but we don't want to overwhelm the user with
// minutiae.

Package.describe({
  summary: "Adaptor for using MongoDB and Minimongo over Livedata",
  internal: true
});

Package.on_use(function (api) {
  api.use(['uuid', 'json', 'underscore', 'minimongo', 'logging', 'livedata'],
          ['client', 'server']);

  api.add_files('mongo_driver.js', 'server');
  api.add_files('local_collection_driver.js', ['client', 'server']);
  api.add_files('remote_collection_driver.js', 'server');
  api.add_files('collection.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('mongo-livedata');
  api.use('tinytest');
  api.use('test-helpers');
  api.add_files('mongo_livedata_tests.js', ['client', 'server']);
  api.add_files('allow_tests.js', ['client', 'server']);
});