// Ensure the global Promise constructor knows how to run all its
// callbacks in Fibers.

const { Promise } = global;

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
