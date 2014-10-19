Package.describe({
  summary: "Register callbacks on a hook",
  version: '1.0.1'
});

Package.on_use(function (api) {
  api.use('underscore', ['client', 'server']);

  api.export('Hook');

  api.add_files('hook.js', ['client', 'server']);
});
