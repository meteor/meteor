// node (v8) defaults to only recording 10 lines of stack trace.
// this becomes especially bad when using fibers, since you get deeper
// stack traces that would have been split up between different callbacks
//
// this only affects the `meteor` executable, not server code on
// meteor apps.
Error.stackTraceLimit = Infinity; // http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi

var _ = require("underscore");
var Fiber = require("fibers");
var Future = require("fibers/future");

// runs a function within a fiber. we wrap the entry point into
// meteor.js into a fiber but if you use callbacks that call
// synchronous code you need to wrap those as well.
//
// NOTE: It's probably better to not use callbacks. Instead you can
// use Futures to generate synchronous equivalents.
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
