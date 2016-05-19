exports.Promise = require("meteor-promise");

// Define MeteorPromise.Fiber so that every Promise callback can run in a
// Fiber drawn from a pool of reusable Fibers.
exports.Promise.Fiber = require("fibers");
