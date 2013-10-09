Package.describe({
  summary: "Helpers for control programs",
  internal: true
});

Npm.depends({optimist: '0.6.0'});

Package.on_use(function (api) {
  api.use(['underscore', 'livedata', 'mongo-livedata'], 'server');
  api.export('Ctl', 'server');
  api.add_files('ctl-helper.js', 'server');
});
