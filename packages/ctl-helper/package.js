Package.describe({
  summary: "Helpers for control programs"
});

Npm.depends({optimist: '0.4.0'});

Package.on_use(function (api) {
  api.use(['underscore', 'livedata', 'mongo-livedata'], 'server');
  api.add_files('ctl-helper.js', 'server');
});
