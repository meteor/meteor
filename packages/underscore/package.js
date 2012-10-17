Package.describe({
  summary: "Collection of small helper functions: _.map, _.each, ..."
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];
  api.add_files('underscore.js', where);
});
