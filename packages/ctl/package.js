Package.describe({
  summary: "Default control program for an application"
});

Npm.depends({optimist: '0.4.0'});

Package.on_use(function (api) {
  api.use(['underscore', 'livedata', 'mongo-livedata'], 'server');

  api.add_files('ctl.js', 'server');
});
