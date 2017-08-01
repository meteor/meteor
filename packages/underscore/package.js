Package.describe({
  summary: "Collection of small helpers: _.map, _.each, ...",
  version: '1.0.10'
});

Package.onUse(function (api) {
  // NOTE: we patch _.each and various other functions that polymorphically take
  // objects, arrays, and array-like objects (such as the querySelectorAll
  // return value, document.images, and 'arguments') such that objects with a
  // numeric length field whose constructor === Object are still treated as
  // objects, not as arrays.  Search for looksLikeArray.
  api.addFiles(['pre.js', 'underscore.js', 'post.js']);
  api.export('_');
});
