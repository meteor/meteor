(function () {
  // XXX Document, test, and remove the leading underscore from everything.

  ////////// Meteor.deps._ContextSet

  // Constructor for an empty _ContextSet.
  //
  // A _ContextSet is used to hold a set of Meteor.deps.Contexts that
  // are to be invalidated at some future time.  If a Context in the
  // set becomes invalidated for any reason, it's immediately removed
  // from the set.
  var _ContextSet = function () {
    this._contextsById = {};
  };

  // Adds the Context `ctx` to this set if it is not already
  // present.  Returns true if the context is new to this set.
  _ContextSet.prototype.add = function (ctx) {
    var self = this;
    if (ctx && ! (ctx.id in self._contextsById)) {
      self._contextsById[ctx.id] = ctx;
      ctx.onInvalidate(function () {
        delete self._contextsById[ctx.id];
      });
      return true;
    }
    return false;
  };

  // Adds the current Context to this set if there is one.  Returns
  // true if there is a current Context and it's new to the set.
  _ContextSet.prototype.addCurrentContext = function () {
    var self = this;
    var context = Meteor.deps.Context.current;
    if (! context)
      return false;
    return self.add(context);
  };

  // Invalidate all Contexts in this set.  They will be removed
  // from the set as a consequence.
  _ContextSet.prototype.invalidateAll = function () {
    var self = this;
    for (var id in self._contextsById)
      self._contextsById[id].invalidate();
  };

  // Returns true if there are no Contexts in this set.
  _ContextSet.prototype.isEmpty = function () {
    var self = this;
    for(var id in self._contextsById)
      return false;
    return true;
  };

  Meteor.deps._ContextSet = _ContextSet;

  ////////// Meteor.autorun

  // Run f(). Record its dependencies. Rerun it whenever the
  // dependencies change.
  //
  // Returns an object with a stop() method. Call stop() to stop the
  // rerunning.  Also passes this object as an argument to f.
  Meteor.autorun = function (f) {
    var ctx;
    var slain = false;
    var handle = {
      stop: function () {
        slain = true;
        ctx.invalidate();
      }
    };
    var rerun = function () {
      if (slain)
        return;
      ctx = new Meteor.deps.Context;
      ctx.run(function () { f.call(this, handle); });
      ctx.onInvalidate(rerun);
    };
    rerun();
    return handle;
  };

  ////////// Meteor._atFlush

  // Run 'f' at Meteor.flush()-time. If atFlush is called multiple times,
  // we guarantee that the 'f's will run in the same order that
  // atFlush was called on them.  If we are inside a Meteor.flush() already,
  // f will be scheduled as part of the current flush().

  var atFlushQueue = [];
  var atFlushContext = null;
  Meteor._atFlush = function (f) {
    atFlushQueue.push(f);

    if (! atFlushContext) {
      atFlushContext = new Meteor.deps.Context;
      atFlushContext.onInvalidate(function () {
        var f;
        while ((f = atFlushQueue.shift())) {
          // Since atFlushContext is truthy, if f() calls atFlush
          // reentrantly, it's guaranteed to append to atFlushQueue and
          // not contruct a new atFlushContext.
          try {
            f();
          } catch (e) {
            Meteor._debug("Exception from Meteor._atFlush:", e.stack);
          }
        }
        atFlushContext = null;
      });

      atFlushContext.invalidate();
    }
  };

})();