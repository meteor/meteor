Package.describe({
  summary: "Tiny testing framework",
  internal: true
});

Package.on_use(function (api) {
  // "past" is always included before app code (see init_from_app_dir) but not
  // before packages when testing. This makes sure that tests see
  // backward-compatibility hooks, at least if they use tinytest.
  api.use('past');

  api.use('underscore', ['client', 'server']);

  api.add_files('tinytest.js', ['client', 'server']);

  api.use('mongo-livedata', ['client', 'server']);
  api.add_files('model.js', ['client', 'server']);

  api.add_files('tinytest_client.js', 'client');
  api.use('startup', 'server');
  api.add_files('tinytest_server.js', 'server');
});
