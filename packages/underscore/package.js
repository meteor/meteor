Package.describe({
  summary: "Collection of small helper functions: _.map, _.each, ..."
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];

  // Like all package, we have an implicit depedency on the 'meteor'
  // package, which provides such things as the *.js file handler. Use
  // an undocumented API to allow 'meteor' to after us even though we
  // depend on it. This is necessary since 'meteor' depends on us. One
  // day we will avoid this problem by refactor, but for now this is a
  // practical and expedient solution.
  api.use('meteor', where, {unordered: true});

  api.exportSymbol('_', where);

  api.add_files('underscore.js', where);
});
