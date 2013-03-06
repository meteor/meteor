(function () {
  Deps = {};
  Deps.active = false;
  Deps.currentComputation = null;

  var _debugFunc = function () {
    // evaluate this lazily in order to not constrain load order
    return (typeof Meteor !== "undefined" ? Meteor._debug :
            ((typeof console !== "undefined") && console.log ? console.log :
             function () {}));
  };

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

  // Deps.Computation constructor is visible but private
  var constructingComputation = false;

  Deps.Computation = function (f, parent) {
    if (! constructingComputation)
      throw new Error(
        "Deps.Computation constructor is private; use Deps.run");
    constructingComputation = false;

    var self = this;
    self.stopped = false;
    self.invalidated = false;
    self.active = false;
    self.firstRun = true;

    self._id = nextId++;
    self._callbacks = {
      onInvalidate: [],
      afterInvalidate: []
    };
    // the plan is at some point to use the parent relation
    // to constrain the order that computations are processed
    self._parent = parent;
    self._func = (f || function () {});

    try {
      self._run();
    } finally {
      self.firstRun = false;
    }
  };

  _.extend(Deps.Computation.prototype, {

    onInvalidate: function (f) {
      if (! this.active)
        throw new Error(
          "Can only register callbacks on an active Computation");

      this._callbacks.onInvalidate.push(f);
    },

    afterInvalidate: function (f) {
      if (! this.active)
        throw new Error(
          "Can only register callbacks on an active Computation");

      this._callbacks.afterInvalidate.push(f);
    },

    invalidate: function () {
      if (! this.invalidated) {
        if (! this.active)
          // an active computation is enqueued at
          // end of _run instead.
          this._enqueue();
        this.invalidated = true;
      }
    },

    stop: function () {
      if (! this.stopped) {
        this.invalidate();
        this.stopped = true;
      }
    },

    _enqueue: function () {
      requireFlush();
      pendingComputations.push(this);
    },

    _run: function () {
      var self = this;
      self.invalidated = false;

      var previous = Deps.currentComputation;
      Deps.currentComputation = self;
      Deps.active = true;
      self.active = true;
      try {
        self._func(self);
      } finally {
        self.active = false;
        Deps.currentComputation = previous;
        Deps.active = !! Deps.currentComputation;
      }

      if (self.invalidated)
        self._enqueue();
    },

    _process: function () {
      var self = this;

      while (self.invalidated) {
        var onInvalidateCallbacks = self._callbacks.onInvalidate;
        self._callbacks.onInvalidate = [];
        var afterInvalidateCallbacks = self._callbacks.afterInvalidate;
        self._callbacks.afterInvalidate = [];

        for(var i = 0, f; f = onInvalidateCallbacks[i]; i++) {
          try {
            f(self);
          } catch (e) {
            _debugFunc()("Exception from Deps invalidation callback:",
                         e.stack);
          }
        }

        if (! self.stopped) {
          try {
            self._run();
          } catch (e) {
            _debugFunc()("Exception from Deps rerun:", e.stack);
          }
        }

        for(var i = 0, f; f = afterInvalidateCallbacks[i]; i++) {
          try {
            f(self);
          } catch (e) {
            _debugFunc()("Exception from Deps invalidation callback:",
                         e.stack);
          }
        }

        if (self.stopped)
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
    // If no argument, defaults to currentComputation (which is required to
    // exist in this case).
    addDependent: function (computation) {
      if (! computation) {
        if (! Deps.active)
          throw new Error(
            "Variable.addDependent() called with no currentComputation");

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
    changed: function () {
      var self = this;
      for (var id in self._dependentsById)
        self._dependentsById[id].invalidate();
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
      if (inFlush) {
        // note: consider removing this warning if it comes up
        // in legit uses of flush and is annoying.
        _debugFunc()("Warning: Ignored nested Deps.flush:",
                     (new Error).stack);
        return;
      }

      inFlush = true;
      willFlush = true;

      // It's possible for Computations to be active,
      // if we are in an enclosing Deps.run in its
      // first run (i.e. not called from flush).
      // Keep one from being currentComputation.
      Deps.nonreactive(function () {

        while (pendingComputations.length) {
          var comps = pendingComputations;
          pendingComputations = [];

          for (var i = 0, comp; comp = comps[i]; i++)
            comp._process();
        }

      });

      inFlush = false;
      willFlush = false;
    },

    // Run f(). Record its dependencies. Rerun it whenever the
    // dependencies change.
    //
    // Returns a new Computation, which is also passed to f.
    //
    // Links the computation to the current computation
    // so that it is stopped if the current computation is invalidated.
    run: function (f) {
      constructingComputation = true;
      var c = new Deps.Computation(f, Deps.currentComputation);

      if (Deps.active)
        Deps.onInvalidate(function () {
          c.stop();
        });

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

    depend: function (v) {
      if (! Deps.active)
        return false;

      return v.addDependent();
    },

    atFlush: function (f) {
      Deps.nonreactive(function () {
        Deps.run(function (c) {
          c.onInvalidate(f);
          c.stop();
        });
      });
    }

});

})();
