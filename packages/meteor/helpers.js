if (Meteor.isServer)
  var Future = Npm.require('fibers/future');

if (typeof __meteor_runtime_config__ === 'object' &&
    __meteor_runtime_config__.meteorRelease)
  Meteor.release = __meteor_runtime_config__.meteorRelease;

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

  // _wrapAsync can wrap any function that takes some number of arguments that
  // can't be undefined, followed by some optional arguments, where the callback
  // is the last optional argument.
  // e.g. fs.readFile(pathname, [callback]),
  // fs.open(pathname, flags, [mode], [callback])
  // For maximum effectiveness and least confusion, wrapAsync should be used on
  // functions where the callback is the only argument of type Function.
  //
  _wrapAsync: function (fn) {
    return function (/* arguments */) {
      var self = this;
      var callback;
      var fut;
      var newArgs = _.toArray(arguments);

      var logErr = function (err) {
        if (err)
          return Meteor._debug("Exception in callback of async function",
                               err.stack ? err.stack : err);
      };

      // Pop off optional args that are undefined
      while (newArgs.length > 0 &&
             typeof(newArgs[newArgs.length - 1]) === "undefined") {
        newArgs.pop();
      }
      // If we have any left and the last one is a function, then that's our
      // callback; otherwise, we don't have one.
      if (newArgs.length > 0 &&
          newArgs[newArgs.length - 1] instanceof Function) {
        callback = newArgs.pop();
      } else {
        if (Meteor.isClient) {
          callback = logErr;
        } else {
          fut = new Future();
          callback = fut.resolver();
        }
      }
      newArgs.push(Meteor.bindEnvironment(callback));
      var result = fn.apply(self, newArgs);
      if (fut)
        return fut.wait();
      return result;
    };
  },

  // Sets child's prototype to a new object whose prototype is parent's
  // prototype. Used as:
  //   Meteor._inherit(ClassB, ClassA).
  //   _.extend(ClassB.prototype, { ... })
  // Inspired by CoffeeScript's `extend` and Google Closure's `goog.inherits`.
  _inherits: function (Child, Parent) {
    // copy static fields
    _.each(Parent, function (prop, field) {
      Child[field] = prop;
    });

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
