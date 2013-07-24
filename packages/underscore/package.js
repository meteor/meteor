Package.describe({
  summary: "Collection of small helper functions: _.map, _.each, ..."
});

Package.on_use(function (api) {
  // Like all packages, we have an implicit depedency on the 'meteor'
  // package, which provides such things as the *.js file handler. Use
  // an undocumented API to allow 'meteor' to after us even though we
  // depend on it. This is necessary since 'meteor' depends on us. One
  // day we will avoid this problem by refactor, but for now this is a
  // practical and expedient solution.
  //
  // XXX Now the *.js handler is intrinsic rather than coming from the
  // 'meteor' package and we could remove this (if we provided a way
  // to let the package opt to not depend on 'meteor'.) We could even
  // remove unordered dependency support, though I think it's worth keeping
  // around for now to keep the possibility of dependency
  // configuration alive in the codebase.
  api.use('meteor', {unordered: true});

  api.exportSymbol('_');

  api.add_files('underscore.js');
});
