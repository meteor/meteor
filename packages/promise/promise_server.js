var MeteorPromise = Npm.require("meteor-promise");
// Define MeteorPromise.Fiber so that every Promise callback can run in a
// Fiber drawn from a pool of reusable Fibers.
MeteorPromise.Fiber = Npm.require("fibers");
Promise = MeteorPromise;
