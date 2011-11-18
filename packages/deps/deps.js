Sky = window.Sky || {};

(function () {
  var current_id = null; // null or string
  var saved_ids = []; // for recursive invocations of captureDependencies

  // if no key for an id, cleanup has already fired
  var callback_functions = {}; // id -> function that was passed in.
  var callback_groups = {}; // id -> list of functions to call on clean up

  // can be called multiple times per id, but should only act once.
  function fireCallbacks(id) {
    _.each(callback_groups[id] || [], function (c) {
      c(); // XXX wrap in try?
    });
    delete callback_groups[id];

    if (callback_functions[id])
      callback_functions[id]();
    delete callback_functions[id];
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
      ///
      /// XXX could use a better name. maybe 'redo'?  maybe just
      /// 'capture'? and you can talk about 'seeing if you're in a
      /// capture' or 'getting the current capture' or 'invalidating
      /// the capture'. 'change' is another word like 'invalidate' but
      /// might be too much like baby-talk. 'rerun' is another word
      /// like 'invalidate' but probably muddles the conceptual
      /// waters.
      captureDependencies: function (func, callback) {
        // XXX don't get this out of minimongo.
        var id = Collection._genId();

        // push old id onto the stack, if any.
        if (current_id)
          saved_ids.push(current_id);

        // save off our callback and set up the group
        callback_functions[id] = callback;
        callback_groups[id] = [];

        // run the passed in func w/ current_id set.
        current_id = id;
        try {
          var ret = func();
        } finally {
          // reset stack
          if (saved_ids.length)
            current_id = saved_ids.pop();
          else
            current_id = null;
        }

        // return the results of func.
        return ret;
      },

      /// Get a function to call when data changes. This is used by
      /// packages that want to support captureDependencies.
      ///
      /// Returns null if we're not in a captureDependencies. In this
      /// case, the caller does not need to take any action. callback is
      /// not called.
      ///
      /// Otherwise returns a function. The caller should call this
      /// function when a piece of information has changed and the
      /// captureDependencies block should be re-run. Generally, the
      /// caller will call this once per call into their package (ie,
      /// once per Session.get, Collection.find).
      ///
      /// When someone invalidates the dependency block, callback will
      /// be called. Future calls to the returned function are
      /// ignored. This is the opportunity to clean up outstanding
      /// findLives, session keys, etc. The callback is called for
      /// everyone in the captureDependencies block, including the user
      /// who invalidated.
      ///
      /// XXX maybe change this API so that people know in advance if
      /// they will be needing a callback function. Several callsites do
      /// non-trivial work to generate callbacks, and they might not be
      /// needed.
      getInvalidationFunction: function (callback) {
        // if we're not in a capture deps block, just return null.
        if (!current_id) return null;
        var id = current_id;

        // register our cleanup function
        if (callback && callback_groups[id])
          callback_groups[id].push(callback);

        return function () { fireCallbacks(id); };
      }

    }});
})();
