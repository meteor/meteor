Package.describe({
  summary: "Register callbacks on a hook",
  internal: true
});

Package.on_use(function (api) {
  api.use('underscore', ['client', 'server']);

  api.export('Hook');

  api.add_files('hook.js', ['client', 'server']);
});
