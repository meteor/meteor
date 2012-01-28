Package.describe({
  summary: "Session variable",
  internal: true
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];

  api.use(['underscore', 'deps'], where);
  api.add_files('session.js', where);
});
