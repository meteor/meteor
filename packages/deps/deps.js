Sky = window.Sky || {};

// XXX XXX what happens if invalidate is called before the initial
// invocation of func has returned?

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
      /// Execute func. While accessing it, record all of the
      /// invalidation tokens that are handed out. After func completes,
      /// the first time any invalidation function handed out during the
      /// run is called, invoke callback. (One shot -- callback is only
      /// invoked once, not repeated.)
      ///
      /// If called recursively (if callback calls captureDependencies),
      /// then dependencies accrue only to the innermost invocation. You
      /// might say that "each invocation functions independently," or
      /// that captureDependencies "acts as a recomputation fence."
      ///
      /// @return The return value of 'func'
      monitor: function (func, callback) {
        // if invoked recursively, save parent context
        var prev_id = active_id;

        // create a new monitor context
        active_id = next_id++;
        Sky.deps.monitoring = true;
        callbacks[active_id] = [callback];

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

      /// True if inside a 'monitor' block.
      monitoring: false,

      /// If inside a 'monitor' block: This will be a function. If
      /// your package wants to support 'monitor', then you need to
      /// save this function off, and call it if a piece of
      /// information has changed and the 'monitor' block should be
      /// re-run. Only the first call matters (by code in the
      /// 'monitor' block); all subsequent calls will be ignored.
      ///
      /// If not inside a 'monitor' block: throws an exception.
      getInvalidate: function () {
        if (!active_id)
          throw new Error("Not inside monitor()");

        return _.bind(invalidate, null, active_id);
      },

      /// If inside 'monitor' block: register a cleanup function. When
      /// 'changed' is called on the block, your callback function
      /// will be called. It will be called exactly once. Use this to
      /// clean up whatever event handlers you had wired up to
      /// 'changed'. In other words, when you get this call, you know
      /// that you are no longer responsible for calling 'changed'.
      ///
      /// If not inside 'monitor' block: throws an exception.
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
