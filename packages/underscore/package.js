Package.describe({
  summary: "Collection of small helper functions (map, each, bind, ...)"
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];
  api.add_files('underscore.js', where);
});
