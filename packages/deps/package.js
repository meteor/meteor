// XXX rename package?

Package.describe({
  summary: "Dependency mananger to allow reactive callbacks",
  internal: true
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];

  api.use('underscore', where);
  api.add_files(['deps.js', 'deps-utils.js'], where);
});
