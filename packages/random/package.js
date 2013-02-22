Package.describe({
  summary: "Random number generator and utilities",
  internal: true
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];
  api.add_files('random.js', where);
});
