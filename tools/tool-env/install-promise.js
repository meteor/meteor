// Install a global ES2015-compliant Promise constructor that knows how to
// run all its callbacks in Fibers.

var Promise = global.Promise ||
  require("promise/lib/es6-extensions");

function makeCompatible(newPromise) {
  require("meteor-promise").makeCompatible(
    newPromise,
    require("fibers")
  );
}

makeCompatible(Promise);

Object.defineProperty(global, "Promise", {
  get: function () {
    return Promise;
  },

  // Make the new Promise compatible with Fibers, but do not allow further
  // modifications to global.Promise, e.g. by misbehaving polyfills.
  set: makeCompatible
});
