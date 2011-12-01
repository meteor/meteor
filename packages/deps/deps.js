Sky = window.Sky || {};

(function () {
  var next_id = 1;
  var active_id = null; // null if not inside monitor
  var callbacks = {}; // id -> list of functions to call on invalidate

  function invalidate (id) {
    var funcs = callbacks[id] || [];
    delete callbacks[id];

    _.each(funcs, function (f) {
      f(); // XXX wrap in try?
    });
  };

  _.extend(Sky, {
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
        if (!active_id)
          throw new Error("Not inside monitor()");

        return _.bind(invalidate, null, active_id);
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
      }

    }});
})();
