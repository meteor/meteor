// It's vitally important that we wrap Fiber.yield and other yielding
// methods before we call makeCompatible, because the meteor-promise
// implementation captures Fiber.yield and keeps calling the captured
// version, which ignores any wrapping that happens later.
require("./wrap-fibers.js");

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
