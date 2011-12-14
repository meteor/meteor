if (typeof Sky === "undefined") Sky = {};

(function () {
  var next_id = 1;
  var active_id = null; // null if not inside monitor
  var callbacks = {}; // id -> list of functions to call on invalidate
  var pending_invalidations = [];

  _.extend(Sky, {
    /// XXX document
    /// XXX is it weird that this is on the root namespace?
    flush: function () {
      _.each(pending_invalidations, function (id) {
        var funcs = callbacks[id] || [];
        delete callbacks[id];

        _.each(funcs, function (f) {
          f(); // XXX wrap in try?
        });
      });

      pending_invalidations = [];
    },

    deps: {
      /// Create a new monitor block, execute func inside it, and
      /// return func's value. When the monitor block is invalidated,
      /// call on_invalidated and any cleanup functions registered
      /// from within the block using Sky.deps.cleanup. To invalidate
      /// the monitor block, retrieve the block's invalidation
      /// function by calling Sky.deps.getInvalidate from within the
      /// block, and then call it at any time (not necessarily from
      /// within the block.) Invalidation is idempotent.
      ///
      /// May be called recursively, in which case each invocation is
      /// indepedent, and Sky.deps.getInvalidate and Sky.deps.cleanup
      /// operate on the innermost invocation.
      monitor: function (func, on_invalidated) {
        // if invoked recursively, save parent context
        var prev_id = active_id;

        // create a new monitor context
        active_id = next_id++;
        Sky.deps.monitoring = true;
        callbacks[active_id] = [on_invalidated];

        // run the func in that context, and return the result
        try {
          var ret = func();
        } finally {
          // restore the previous context
          active_id = prev_id;
          Sky.deps.monitoring = (active_id !== null);
        }

        return ret;
      },

      /// True if inside a monitor block.
      monitoring: false,

      /// Return the invalidation function for the current monitor
      /// block, or throw an exception if not inside a monitor block.
      getInvalidate: function () {
        var id = active_id;
        if (!id)
          throw new Error("Not inside monitor()");

        return function () {
          if (!pending_invalidations.length)
            setTimeout(Sky.flush);
          pending_invalidations.push(id);
        };
      },

      /// Register a cleanup function on the current monitor block, or
      /// throw an exception if not inside a monitor block.
      cleanup: function (callback) {
        if (!active_id)
          throw new Error("Not inside monitor()");

        if (!(active_id in callbacks))
          callback(); // already invalidated!
        else
          callbacks[active_id].push(callback);
      },

      /// Usage: once(obj, key1, key2...) -- obj is a context object
      /// that the caller provides (initialize it to {}). once returns
      /// false if called outside of a monitor block, or it returns
      /// true the first time it called within a monitor block for a
      /// given context object and key sequence. (except that two key
      /// values that map to the same string are considered equal.)
      /// XXX this is a weird and nasty function
      /// XXX maybe revisit this whole api in terms of:
      ///   - Sky.depend(key), Sky.invalidate(key) [key scoped like obj?]
      ///   - or retrieving the "current dependency context" which can
      ///     then be manipulated
      /// XXX document (including the fact that this file isn't 50 line anymore)
      once: function (obj) {
        var id = active_id;
        if (!id)
          return false;
        if (!obj[id])
          Sky.deps.cleanup(function () {
            delete obj[id];
          });
        var key = [id];
        for (var i = 1; i < arguments.length; i++)
          key.push("_" + arguments[i]);
        var leaf = obj;
        for (var i = 0; i < key.length; i++) {
          if (!(key[i] in leaf))
            leaf[key[i]] = {};
          leaf = leaf[key[i]];
        }
        if ('' in leaf)
          return false;
        leaf[''] = true;
        return true;
      }

    }});
})();
