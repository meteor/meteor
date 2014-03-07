var _ = require("underscore");
var Fiber = require("fibers");
var Future = require("fibers/future");

// Use this to wrap callbacks that need to run in a fiber, when
// passing callbacks to functions such as setTimeout that aren't
// callback-aware. (In app code we handle this with Meteor.setTimeout,
// but we don't have such a thing in the tools code yet.)
//
// Specifically, given a function f, this returns a new function that
// returns immediately but also runs f (with any provided arguments)
// in a new fiber.
//
// NOTE: It's probably better to not use callbacks. Instead you can
// use Futures to generate synchronous equivalents.
//
// XXX just suck it up and replace setTimeout and clearTimeout,
// globally, with fiberized versions? will this mess up npm dependencies?
exports.inFiber = function (func) {
  return function (/*arguments*/) {
    var self = this;
    var args = arguments;
    new Fiber(function () {
      func.apply(self, args);
    }).run();
  };
};

exports.parallelEach = function (collection, callback, context) {
  var futures = _.map(collection, function () {
    var args = _.toArray(arguments);
    return function () {
      return callback.apply(context, args);
    }.future()();
  });
  Future.wait(futures);
  // Throw if any threw.
  _.each(futures, function (f) { f.get(); });
};

exports.firstTimeResolver = function (fut) {
  var resolver = fut.resolver();
  return function (err, val) {
    if (fut.isResolved())
      return;
    resolver(err, val);
  };
};
