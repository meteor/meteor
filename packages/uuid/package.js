Package.describe({
  summary: "Better random number and UUIDv4 generators",
  internal: true
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];
  api.add_files('uuid.js', where);
});
