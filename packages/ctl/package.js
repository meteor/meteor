Package.describe({
  summary: "Default control program for an application"
});

Package.on_use(function (api) {
  api.use(['underscore', 'livedata', 'mongo-livedata', 'ctl-helper'], 'server');
  api.exportSymbol('main', 'server');
  api.add_files('ctl.js', 'server');
});
