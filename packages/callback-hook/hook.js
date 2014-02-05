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
// If the hook is configured with an exception handler, the handler
// will be called if a called callback throws an exception.  By
// default (if the exception handler doesn't itself throw an
// exception, or if the iterator function doesn't return a falsy value
// to terminate the calling of callbacks), the remaining callbacks
// will still be called.
//
// The exception handler can be a string, in which case the string (as
// a description of the callback) and the exception will be printed to
// the console log with `Meteor._debug`, and the exception otherwise
// ignored.
//
// If an exception handler isn't specified, exceptions thrown in the
// callback will propagate up to the iterator function, and will
// terminate calling the remaining callbacks if not caught.

Hook = function (exceptionHandler) {
  var self = this;
  self.nextCallbackId = 0;
  self.callbacks = {};
  self.exceptionHandler = exceptionHandler;
};

_.extend(Hook.prototype, {
  register: function (callback) {
    var self = this;

    callback = Meteor.bindEnvironment(
      callback,
      self.exceptionHandler || function (exception) {
        self.exception = exception;
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
    var ids = _.keys(self.callbacks);
    for (var i = 0;  i < ids.length;  ++i) {
      var id = ids[i];
      // check to see if the callback was removed during iteration
      if (_.has(self.callbacks, id)) {
        var callback = self.callbacks[id];

        if (! self.exceptionHandler) {
          var originalCallback = callback;
          callback = function (/*arguments*/) {
            self.exception = null;
            var ret = originalCallback.apply(null, arguments);
            if (self.exception) {
              var exception = self.exception;
              self.exception = null;
              throw exception;
            }
            return ret;
          };
        }

        if (! iterator(callback))
          break;
      }
    }
  }
});
