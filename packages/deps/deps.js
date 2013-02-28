(function () {
  Deps = {};
  Deps.active = false;
  Deps.currentComputation = null;

  var nextId = 1;
  // computations whose callbacks we should call at flush time
  var pendingComputations = [];
  // `true` if a Deps.flush is scheduled, or if we are in Deps.flush now
  var willFlush = false;
  // `true` if we are in Deps.flush now
  var inFlush = false;

  var requireFlush = function () {
    if (! willFlush) {
      setTimeout(Deps.flush, 0);
      willFlush = true;
    }
  };

  Deps.Computation = function (f) {
    this._id = nextId++;
    this._callbacks = {
      onInvalidate: [],
      afterInvalidate: []
    };
    this.stopped = false;
    this.invalidated = false;
    this._parent = null; // set in Deps.run; for future use
    this._func = (f || function () {});

    this._run();
  };

  _.extend(Deps.Computation.prototype, {

    onInvalidate: function (f) {
      this._callbacks.onInvalidate.push(f);
    },

    afterInvalidate: function (f) {
      this._callbacks.afterInvalidate.push(f);
    },

    invalidate: function () {
      if (! this.invalidated) {
        pendingComputations.push(this);
        requireFlush();
        this.invalidated = true;
      }
    },

    stop: function () {
      if (! this.stopped) {
        if (! this.invalidated) {
          requireFlush();
          pendingComputations.push(this);
        }
        this.invalidated = true;
        this.stopped = true;
      }
    },

    _run: function () {
      var previous = Deps.currentComputation;
      Deps.currentComputation = this;
      Deps.active = true;
      try {
        this._func(this);
      } finally {
        Deps.currentComputation = previous;
        Deps.active = !! Deps.currentComputation;
      }
    },

    _callCallbacks: function (which) {
      var self = this;
      var callbacks = self._callbacks;

      // call funcs in callbacks[which] in order, allowing
      // for new ones that might come along during the loop.
      while (callbacks[which].length) {
        var funcs = callbacks[which];
        callbacks[which] = [];

        for(var i = 0, f; f = funcs[i]; i++) {
          try {
            f(self);
          } catch (e) {
            Meteor._debug("Exception from Deps " + which + " callback:",
                          e.stack);
          }
        }
      }
    },

    _service: function () {
      while (this.invalidated) {
        this._callCallbacks('onInvalidate');
        if (! this.stopped) {
          try {
            this._run();
          } catch (e) {
            Meteor._debug("Exception from Deps rerun:", e.stack);
          }
          this.invalidated = false;
        }
        this._callCallbacks('afterInvalidate');

        if (this.stopped)
          break;

        // If we're not stopped but we are invalidated, also loop.
        // It's valid in some cases for a computation to invalidate
        // itself (or for afterInvalidate to invalid it), but we
        // could add a run-away loop counter here.
      }
    }
  });

  Deps.Variable = function () {
    this._dependentsById = {};
  };

  _.extend(Deps.Variable.prototype, {
    // Adds `computation` to this set if it is not already
    // present.  Returns true if `computation` is a new member of the set.
    // Defaults to currentComputation, which must exist.
    depend: function (computation) {
      if (! computation) {
        if (! Deps.active)
          throw new Error("Variable.depend() called with no currentComputation");
        computation = Deps.currentComputation;
      }
      var self = this;
      var id = computation._id;
      if (! (id in self._dependentsById)) {
        self._dependentsById[id] = computation;
        computation.onInvalidate(function () {
          delete self._dependentsById[id];
        });
        return true;
      }
      return false;
    },
    change: function () {
      var self = this;
      for (var id in self._dependentsById)
        self._dependentsById[id].invalidate();
    },
    // XXX TEMPORARY
    changed: function () {
      this.change();
    },
    hasDependents: function () {
      var self = this;
      for(var id in self._dependentsById)
        return true;
      return false;
    }
  });

  _.extend(Deps, {
    flush: function () {
      // Nested flush could plausibly happen if, say, a flush causes
      // DOM mutation, which causes a "blur" event, which runs an
      // app event handler that calls Deps.flush.  At the moment
      // Spark blocks event handlers during DOM mutation anyway,
      // because the LiveRange tree isn't valid.  And we don't have
      // any useful notion of a nested flush.
      //
      // https://app.asana.com/0/159908330244/385138233856
      if (inFlush)
        return;

      inFlush = true;
      willFlush = true;

      while (pendingComputations.length) {
        var comps = pendingComputations;
        pendingComputations = [];

        for (var i = 0, comp; comp = comps[i]; i++)
          comp._service();
      }

      inFlush = false;
      willFlush = false;
    },

    // Run f(). Record its dependencies. Rerun it whenever the
    // dependencies change.
    //
    // Returns a new Computation, which is also passed to f.
    //
    // Additionally, links the computation to the current computation
    // so that it is stopped if the current computation is invalidated.
    run: function (f) {
      var c = new Deps.Computation(f);

      if (Deps.active) {
        c._parent = Deps.currentComputation;
        c._parent.onInvalidate(function () {
          c.stop();
        });
      }

      return c;
    },

    // Run `f` with no current computation, returning the return value
    // of `f`.  Used to turn off reactivity for the duration of `f`,
    // so that reactive data sources accessed by `f` will not result in any
    // computations being invalidated.
    nonreactive: function (f) {
      var previous = Deps.currentComputation;
      Deps.currentComputation = null;
      Deps.active = false;
      try {
        return f();
      } finally {
        Deps.currentComputation = previous;
        Deps.active = !! Deps.currentComputation;
      }
    },

    onInvalidate: function (f) {
      if (! Deps.active)
        throw new Error("Deps.onInvalidate needs a currentComputation");

      Deps.currentComputation.onInvalidate(f);
    },

    afterInvalidate: function (f) {
      if (! Deps.active)
        throw new Error("Deps.afterInvalidate needs a currentComputation");

      Deps.currentComputation.afterInvalidate(f);
    },

    // XXX TEMPORARY
    autorun: function (f) {
      return Deps.run(f);
    },
    depend: function (v) {
      if (! Deps.active)
        return false;
      return v.depend();
    },
    afterFlush: function (f) {
      var c = new Deps.Computation();
      c.onInvalidate(f);
      c.stop();
    }

});

})();
