require("meteor-babel-helpers");

var MeteorPromise = require("meteor-promise");
MeteorPromise.Fiber = require("fibers");
Promise = MeteorPromise;

// If Promise.asyncApply is defined, use it to wrap calls to
// regeneratorRuntime.async so that the entire async function will run in
// its own Fiber, not just the code that comes after the first await.
if (typeof Promise.asyncApply === "function") {
  var regeneratorRuntime = require("babel-runtime/regenerator").default;
  var realAsync = regeneratorRuntime.async;
  regeneratorRuntime.async = function (innerFn) {
    return Promise.asyncApply(realAsync, regeneratorRuntime, arguments);
  };
}
