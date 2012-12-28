// node (v8) defaults to only recording 10 lines of stack trace.
// this becomes especially bad when using fibers, since you get deeper
// stack traces that would have been split up between different callbacks
//
// this only affects the `meteor` executable, not server code on
// meteor apps.
Error.stackTraceLimit = Infinity; // http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi

// runs a function within a fiber. we wrap the entry point into meteor.js into a fiber
// but if you use callbacks that call synchronous code you need to wrap those as well.
//
// NOTE: It's probably better to not use callbacks. Instead you can
// use Futures to generate synchronous equivalents.
exports.inFiber = function(func) {
  return function() {
    new Fiber(func).run();
  };
};

