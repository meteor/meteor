if (Meteor.isServer)
  var Future = Npm.require('fibers/future');

if (typeof __meteor_runtime_config__ === 'object' &&
    __meteor_runtime_config__.meteorRelease) {
  /**
   * @summary `Meteor.release` is a string containing the name of the [release](#meteorupdate) with which the project was built (for example, `"1.2.3"`). It is `undefined` if the project was built using a git checkout of Meteor.
   * @locus Anywhere
   * @type {String}
   */
  Meteor.release = __meteor_runtime_config__.meteorRelease;
}

// XXX find a better home for these? Ideally they would be _.get,
// _.ensure, _.delete..

_.extend(Meteor, {
  // _get(a,b,c,d) returns a[b][c][d], or else undefined if a[b] or
  // a[b][c] doesn't exist.
  //
  _get: function (obj /*, arguments */) {
    for (var i = 1; i < arguments.length; i++) {
      if (!(arguments[i] in obj))
        return undefined;
      obj = obj[arguments[i]];
    }
    return obj;
  },

  // _ensure(a,b,c,d) ensures that a[b][c][d] exists. If it does not,
  // it is created and set to {}. Either way, it is returned.
  //
  _ensure: function (obj /*, arguments */) {
    for (var i = 1; i < arguments.length; i++) {
      var key = arguments[i];
      if (!(key in obj))
        obj[key] = {};
      obj = obj[key];
    }

    return obj;
  },

  // _delete(a, b, c, d) deletes a[b][c][d], then a[b][c] unless it
  // isn't empty, then a[b] unless it isn't empty.
  //
  _delete: function (obj /*, arguments */) {
    var stack = [obj];
    var leaf = true;
    for (var i = 1; i < arguments.length - 1; i++) {
      var key = arguments[i];
      if (!(key in obj)) {
        leaf = false;
        break;
      }
      obj = obj[key];
      if (typeof obj !== "object")
        break;
      stack.push(obj);
    }

    for (var i = stack.length - 1; i >= 0; i--) {
      var key = arguments[i+1];

      if (leaf)
        leaf = false;
      else
        for (var other in stack[i][key])
          return; // not empty -- we're done

      delete stack[i][key];
    }
  },

  // wrapAsync can wrap any function that takes some number of arguments that
  // can't be undefined, followed by some optional arguments, where the callback
  // is the last optional argument.
  // e.g. fs.readFile(pathname, [callback]),
  // fs.open(pathname, flags, [mode], [callback])
  // For maximum effectiveness and least confusion, wrapAsync should be used on
  // functions where the callback is the only argument of type Function.

  /**
   * @memberOf Meteor
   * @summary Wrap a function that takes a callback function as its final parameter. The signature of the callback of the wrapped function should be `function(error, result){}`. On the server, the wrapped function can be used either synchronously (without passing a callback) or asynchronously (when a callback is passed). On the client, a callback is always required; errors will be logged if there is no callback. If a callback is provided, the environment captured when the original function was called will be restored in the callback.
   * @locus Anywhere
   * @param {Function} func A function that takes a callback as its final parameter
   * @param {Object} [context] Optional `this` object against which the original function will be invoked
   */
  wrapAsync: function (fn, context) {
    return function (/* arguments */) {
      var self = context || this;
      var newArgs = _.toArray(arguments);
      var callback;

      for (var i = newArgs.length - 1; i >= 0; --i) {
        var arg = newArgs[i];
        var type = typeof arg;
        if (type !== "undefined") {
          if (type === "function") {
            callback = arg;
          }
          break;
        }
      }

      if (! callback) {
        if (Meteor.isClient) {
          callback = logErr;
        } else {
          var fut = new Future();
          callback = fut.resolver();
        }
        ++i; // Insert the callback just after arg.
      }

      newArgs[i] = Meteor.bindEnvironment(callback);
      var result = fn.apply(self, newArgs);
      return fut ? fut.wait() : result;
    };
  },

  // Sets child's prototype to a new object whose prototype is parent's
  // prototype. Used as:
  //   Meteor._inherits(ClassB, ClassA).
  //   _.extend(ClassB.prototype, { ... })
  // Inspired by CoffeeScript's `extend` and Google Closure's `goog.inherits`.
  _inherits: function (Child, Parent) {
    // copy Parent static properties
    for (var key in Parent) {
      // make sure we only copy hasOwnProperty properties vs. prototype
      // properties
      if (_.has(Parent, key))
        Child[key] = Parent[key];
    }

    // a middle member of prototype chain: takes the prototype from the Parent
    var Middle = function () {
      this.constructor = Child;
    };
    Middle.prototype = Parent.prototype;
    Child.prototype = new Middle();
    Child.__super__ = Parent.prototype;
    return Child;
  }
});

var warnedAboutWrapAsync = false;

/**
 * @deprecated in 0.9.3
 */
Meteor._wrapAsync = function(fn, context) {
  if (! warnedAboutWrapAsync) {
    Meteor._debug("Meteor._wrapAsync has been renamed to Meteor.wrapAsync");
    warnedAboutWrapAsync = true;
  }
  return Meteor.wrapAsync.apply(Meteor, arguments);
};

function logErr(err) {
  if (err) {
    return Meteor._debug(
      "Exception in callback of async function",
      err.stack ? err.stack : err
    );
  }
}
