Package.describe({
  summary: "Adaptor for using Redis and Miniredis over Livedata",
  internal: true
});

Package.on_use(function (api) {
  api.use(['json', 'underscore', 'miniredis', 'logging', 'livedata'],
          ['client', 'server']);

  api.add_files('redis_driver.js', 'server');
  api.add_files('local_store_driver.js', ['client', 'server']);
  api.add_files('remote_store_driver.js', 'server');
  api.add_files('redis_hash_driver.js','server');
  api.add_files('redis_string_driver.js','server');
  api.add_files('store.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('redis-livedata');
  api.use('tinytest');
  api.use('test-helpers');
  api.add_files('redis_livedata_tests.js', ['client', 'server']);
});