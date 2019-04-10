const { noContext } = require("optimism");

if (noContext) {
  // If we're using a modern version of optimism that supports noContext,
  // we can use it to wrap yielding Fiber functions so that the current
  // context is suspended before the yield and restored immediately after.
  const Fiber = require("fibers");
  function wrap(obj, method) {
    const fn = obj[method];
    obj[method] = function () {
      return noContext(fn, arguments, this);
    };
  }
  // These methods can yield, according to
  // https://github.com/laverdet/node-fibers/blob/ddebed9b8ae3883e57f822e2108e6943e5c8d2a8/fibers.js#L97-L100
  wrap(Fiber, "yield");
  wrap(Fiber.prototype, "run");
  wrap(Fiber.prototype, "throwInto");
}
