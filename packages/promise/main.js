exports.Promise = require("meteor-promise");
if (Meteor.isServer) {
  // Define MeteorPromise.Fiber so that every Promise callback can run in
  // a Fiber drawn from a pool of reusable Fibers. Split the string
  // literal to avoid confusing the ImportScanner when it scans this file
  // for the web bundle.
  exports.Promise.Fiber = require("fib" + "ers");
}
