require("meteor-promise").makeCompatible(
  exports.Promise = require("./common.js").Promise,
  // Allow every Promise callback to run in a Fiber drawn from a pool of
  // reusable Fibers.
  require("fibers")
);
