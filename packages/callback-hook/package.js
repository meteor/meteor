Package.describe({
  summary: "Register callbacks on a hook",
  version: '1.0.2-ipc.0'
});

Package.onUse(function (api) {
  api.use('underscore', ['client', 'server']);

  api.export('Hook');

  api.addFiles('hook.js', ['client', 'server']);
});
