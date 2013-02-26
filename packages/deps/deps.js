(function () {
  Deps = {};
  Deps.active = false;
  Deps.currentComputation = null;

  var nextId = 1;
  // computations to invalidate at flush
  var pendingInvalidate = [];
  // functions to run at flush after invalidations
  var pendingRunAfter = [];
  // `true` if a Deps.flush is scheduled, or if we are in Deps.flush now
  var willFlush = false;

  var requireFlush = function () {
    if (! willFlush) {
      setTimeout(Deps.flush, 0);
      willFlush = true;
    }
  };

  Deps.Computation = function () {
    // Each computation has a unique number. You can use this to avoid
    // storing multiple copies of the same computation in your
    // invalidation list. The id is an integer >= 1.
    this.id = nextId++;
    this._callbacks = [];
    this.invalidated = false;
  };

  _.extend(Deps.Computation.prototype, {
    run: function (f) {
      var previous = Deps.currentComputation;
      Deps.currentComputation = this;
      Deps.active = true;
      try {
        return f();
      } finally {
        Deps.currentComputation = previous;
        Deps.active = !! Deps.currentComputation;
      }
    },

    // we specifically guarantee that this doesn't call any
    // invalidation functions (before returning) -- it just marks the
    // computation as invalidated.
    invalidate: function () {
      if (!this.invalidated) {
        this.invalidated = true;
        requireFlush();
        pendingInvalidate.push(this);
      }
    },

    // calls f immediately if this computation was already
    // invalidated. f receives one argument, the computation.
    onInvalidate: function (f) {
      if (this.invalidated)
        f(this);
      else
        this._callbacks.push(f);
    },

    // Make this computation depend on v.  Return true
    // if this is a new dependency.
    depend: function (v) {
      return v._addDependent(this);
    }
  });

  Deps.Variable = function () {
    this._dependentsById = {};
  };

  _.extend(Deps.Variable.prototype, {
    // Adds `computation` to this set if it is not already
    // present.  Returns true if `computation` is a new member of the set.
    _addDependent: function (computation) {
      var self = this;
      var id = computation.id;
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
    // Make the current computation depend on v.  Returns true
    // if this is a new dependency.  If there is no current
    // computation, does nothing and returns false.
    depend: function (v) {
      if (Deps.active)
        return v._addDependent(Deps.currentComputation);
      return false;
    },

    flush: function () {
      // XXX specify what happens when flush calls flush. eg, flushing
      // causes a dom update, which causes onblur, which invokes an
      // event handler that calls flush. it's probably an exception --
      // no flushing from inside onblur. can also imagine routing onblur
      // through settimeout(0), which is probably what the user wants.
      // https://app.asana.com/0/159908330244/385138233856

      willFlush = true;

      var done = false;
      // loop until there are no pending invalidations or afterFlushes.
      while (! done) {
        if (pendingInvalidate.length) {

          var pending = pendingInvalidate;
          pendingInvalidate = [];

          _.each(pending, function (comp) {
            // Call `comp`'s `onInvalidate` callbacks.
            //
            // Note: flush guarantees that all the callbacks for a
            // given computation are called before moving on to the
            // next computation (not counting callbacks that are
            // called immediately because the computation is already
            // invalidated when you call onInvalidate).
            //
            // This is important for, eg, subscribe, which wants the
            // callbacks on its unsubscribeCallback to be called after
            // an autorun function is re-run.
            _.each(comp._callbacks, function (f) {
              try {
                f(comp);
              } catch (e) {
                Meteor._debug("Exception from Deps.flush:", e.stack);
              }
            });
            delete comp._callbacks; // maybe help the GC
          });

        } else if (pendingRunAfter.length) {
          var f = pendingRunAfter.shift();
          try {
            // `f` may invalidate computations and/or call `Deps.afterFlush`.
            f();
          } catch (e) {
            Meteor._debug("Exception from Deps.flush:", e.stack);
          }
        } else {
          done = true;
        }
      }

      willFlush = false;
    },

    // Run f(). Record its dependencies. Rerun it whenever the
    // dependencies change.
    //
    // Returns an object with a stop() method. Call stop() to stop the
    // rerunning.  Also passes this object as an argument to f.
    autorun: function (f) {
      var comp;
      var slain = false;
      var handle = {
        stop: function () {
          slain = true;
          comp.invalidate();
        }
      };
      var rerun = function () {
        if (slain)
          return;
        comp = new Deps.Computation;
        comp.run(function () { f.call(this, handle); });
        comp.onInvalidate(rerun);
      };
      rerun();
      return handle;
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

    afterFlush: function (f) {
      pendingRunAfter.push(f);
      requireFlush();
    }
  });

})();
