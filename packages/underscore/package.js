
Package.describe({
  summary: "Collection of small helpers: _.map, _.each, ...",
  version: '1.7.0-rc215.1',
});

Npm.depends({
  '@types/underscore': '1.11.9',
});
Package.onUse(function (api) {
  // Like all packages, we have an implicit dependency on the 'meteor'
  // package, which provides such things as the *.js file handler. Use
  // an undocumented API to allow 'meteor' to alter us even though we
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

  api.export('_');

  // NOTE: we patch _.each and various other functions that polymorphically take
  // objects, arrays, and array-like objects (such as the querySelectorAll
  // return value, document.images, and 'arguments') such that objects with a
  // numeric length field whose constructor === Object are still treated as
  // objects, not as arrays.  Search for looksLikeArray.
  api.addFiles(['pre.js', 'underscore.js', 'post.js']);

  api.addAssets('underscore.d.ts', 'server');
});


Package.onTest(function (api) {
  // Also turn off the strong 'meteor' dependency in the test slice
  api.use('meteor', {unordered: true});
});
