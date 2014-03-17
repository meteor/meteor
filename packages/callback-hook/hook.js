// XXX This pattern is under development. Do not add more callsites
// using this package for now. See:
// https://meteor.hackpad.com/Design-proposal-Hooks-YxvgEW06q6f
//
// Encapsulates the pattern of registering callbacks on a hook.
//
// The `each` method of the hook calls its iterator function argument
// with each registered callback.  This allows the hook to
// conditionally decide not to call the callback (if, for example, the
// observed object has been closed or terminated).
//
// Callbacks are bound with `Meteor.bindEnvironment`, so they will be
// called with the Meteor environment of the calling code that
// registered the callback.
//
// Registering a callback returns an object with a single `stop`
// method which unregisters the callback.
//
// The code is careful to allow a callback to be safely unregistered
// while the callbacks are being iterated over.
//
// If the hook is configured with the `exceptionHandler` option, the
// handler will be called if a called callback throws an exception.
// By default (if the exception handler doesn't itself throw an
// exception, or if the iterator function doesn't return a falsy value
// to terminate the calling of callbacks), the remaining callbacks
// will still be called.
//
// Alternatively, the `debugPrintExceptions` option can be specified
// as string describing the callback.  On an exception the string and
// the exception will be printed to the console log with
// `Meteor._debug`, and the exception otherwise ignored.
//
// If an exception handler isn't specified, exceptions thrown in the
// callback will propagate up to the iterator function, and will
// terminate calling the remaining callbacks if not caught.

Hook = function (options) {
  var self = this;
  options = options || {};
  self.nextCallbackId = 0;
  self.callbacks = {};

  if (options.exceptionHandler)
    self.exceptionHandler = options.exceptionHandler;
  else if (options.debugPrintExceptions) {
    if (! _.isString(options.debugPrintExceptions))
      throw new Error("Hook option debugPrintExceptions should be a string");
    self.exceptionHandler = options.debugPrintExceptions;
  }
};

_.extend(Hook.prototype, {
  register: function (callback) {
    var self = this;

    callback = Meteor.bindEnvironment(
      callback,
      self.exceptionHandler || function (exception) {
        // Note: this relies on the undocumented fact that if bindEnvironment's
        // onException throws, and you are invoking the callback either in the
        // browser or from within a Fiber in Node, the exception is propagated.
        throw exception;
      }
    );

    var id = self.nextCallbackId++;
    self.callbacks[id] = callback;

    return {
      stop: function () {
        delete self.callbacks[id];
      }
    };
  },

  // For each registered callback, call the passed iterator function
  // with the callback.
  //
  // The iterator function can choose whether or not to call the
  // callback.  (For example, it might not call the callback if the
  // observed object has been closed or terminated).
  //
  // The iteration is stopped if the iterator function returns a falsy
  // value or throws an exception.
  //
  each: function (iterator) {
    var self = this;

    // Invoking bindEnvironment'd callbacks outside of a Fiber in Node doesn't
    // run them to completion (and exceptions thrown from onException are not
    // propagated), so we need to be in a Fiber.
    Meteor._nodeCodeMustBeInFiber();

    var ids = _.keys(self.callbacks);
    for (var i = 0;  i < ids.length;  ++i) {
      var id = ids[i];
      // check to see if the callback was removed during iteration
      if (_.has(self.callbacks, id)) {
        var callback = self.callbacks[id];

        if (! iterator(callback))
          break;
      }
    }
  }
});
