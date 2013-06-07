// XXX namespacing -- find a better home for these?

if (Meteor.isServer)
  var Future = Npm.require('fibers/future');

if (typeof __meteor_runtime_config__ === 'object' &&
    __meteor_runtime_config__.meteorRelease)
  Meteor.release = __meteor_runtime_config__.meteorRelease;

_.extend(Meteor, {
  // _get(a,b,c,d) returns a[b][c][d], or else undefined if a[b] or
  // a[b][c] doesn't exist.
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

  _wrapAsync: function (fn) {
    var self = this;
    return function (/* arguments */) {
      var callback;
      var fut;
      var newArgs = Array.prototype.slice.call(arguments);
      var haveCb = newArgs.length &&
            (newArgs[newArgs.length - 1] instanceof Function);
      if (Meteor.isClient && ! haveCb) {
        newArgs.push(function () { });
        haveCb = true;
      }
      if (haveCb) {
        var origCb = newArgs[newArgs.length - 1];
        callback = Meteor.bindEnvironment(origCb, function (e) {
          Meteor._debug("Exception in callback of async function", e.stack);
        });
        newArgs[newArgs.length - 1] = callback;
      } else {
        fut = new Future();
        newArgs[newArgs.length] = fut.resolver();
      }
      fn.apply(self, newArgs);
      if (! haveCb)
        return fut.wait();
    };
  }
});
