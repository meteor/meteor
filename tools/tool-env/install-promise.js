// Install a global ES2015-compliant Promise constructor that knows how to
// run all its callbacks in Fibers.

var Promise = global.Promise = global.Promise ||
  require("promise/lib/es6-extensions");

require("meteor-promise").makeCompatible(
  Promise,
  require("fibers")
);
