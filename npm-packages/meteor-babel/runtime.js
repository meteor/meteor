require("meteor-babel-helpers");

var Module = module.constructor;

// The Reify runtime now requires a working implementation of
// module.resolve, which should return a canonical absolute module
// identifier string, like require.resolve(id).
Module.prototype.resolve = function (id) {
  return Module._resolveFilename(id, this);
};

require("@meteorjs/reify/lib/runtime").enable(Module.prototype);

if (!process.env.DISABLE_FIBERS) {
  require("meteor-promise").makeCompatible(
      global.Promise = global.Promise ||
          require("promise/lib/es6-extensions"),
      require("fibers")
  );

// If Promise.asyncApply is defined, use it to wrap calls to
// regeneratorRuntime.async so that the entire async function will run in
// its own Fiber, not just the code that comes after the first await.
  if (typeof Promise.asyncApply === "function") {
    var regeneratorRuntime = require("@babel/runtime/regenerator");
    var realAsync = regeneratorRuntime.async;
    regeneratorRuntime.async = function (innerFn) {
      return Promise.asyncApply(realAsync, regeneratorRuntime, arguments);
    };
  }
}
