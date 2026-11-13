
Package.describe({
  summary: "JavaScript's utility _ belt",
  version: '1.9.2',
  deprecated: true
});

Npm.depends({
  '@types/underscore': '1.8.20',
});
Package.onUse(function (api) {
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
