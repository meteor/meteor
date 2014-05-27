//////////////////////////////////////////////////
// Package docs at http://docs.meteor.com/#deps //
//////////////////////////////////////////////////

Deps = {};

// http://docs.meteor.com/#deps_active
Deps.active = false;

// http://docs.meteor.com/#deps_currentcomputation
Deps.currentComputation = null;

var setCurrentComputation = function (c) {
  Deps.currentComputation = c;
  Deps.active = !! c;
};

// _assign is like _.extend or the upcoming Object.assign.
// Copy src's own, enumerable properties onto tgt and return
// tgt.
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var _assign = function (tgt, src) {
  for (var k in src) {
    if (_hasOwnProperty.call(src, k))
      tgt[k] = src[k];
  }
  return tgt;
};

var _debugFunc = function () {
  // lazy evaluation because `Meteor` does not exist right away
  return (typeof Meteor !== "undefined" ? Meteor._debug :
          ((typeof console !== "undefined") && console.log ?
           function () { console.log.apply(console, arguments); } :
           function () {}));
};

var _throwOrLog = function (from, e) {
  if (throwFirstError) {
    throw e;
  } else {
    _debugFunc()("Exception from Deps " + from + " function:",
                 e.stack || e.message);
  }
};

// Like `Meteor._noYieldsAllowed(function () { f(comp); })` but shorter,
// and doesn't clutter the stack with an extra frame on the client,
// where `_noYieldsAllowed` is a no-op.  `f` may be a computation
// function or an onInvalidate callback.
var callWithNoYieldsAllowed = function (f, comp) {
  if ((typeof Meteor === 'undefined') || Meteor.isClient) {
    f(comp);
  } else {
    Meteor._noYieldsAllowed(function () {
      f(comp);
    });
  }
};

var nextId = 1;
// computations whose callbacks we should call at flush time
var pendingComputations = [];
// `true` if a Deps.flush is scheduled, or if we are in Deps.flush now
var willFlush = false;
// `true` if we are in Deps.flush now
var inFlush = false;
// `true` if we are computing a computation now, either first time
// or recompute.  This matches Deps.active unless we are inside
// Deps.nonreactive, which nullfies currentComputation even though
// an enclosing computation may still be running.
var inCompute = false;
// `true` if the `_throwFirstError` option was passed in to the call
// to Deps.flush that we are in. When set, throw rather than log the
// first error encountered while flushing. Before throwing the error,
// finish flushing (from a finally block), logging any subsequent
// errors.
var throwFirstError = false;

var afterFlushCallbacks = [];

var requireFlush = function () {
  if (! willFlush) {
    setTimeout(Deps.flush, 0);
    willFlush = true;
  }
};

// Deps.Computation constructor is visible but private
// (throws an error if you try to call it)
var constructingComputation = false;

//
// http://docs.meteor.com/#deps_computation
//
Deps.Computation = function (f, parent) {
  if (! constructingComputation)
    throw new Error(
      "Deps.Computation constructor is private; use Deps.autorun");
  constructingComputation = false;

  var self = this;

  // http://docs.meteor.com/#computation_stopped
  self.stopped = false;

  // http://docs.meteor.com/#computation_invalidated
  self.invalidated = false;

  // http://docs.meteor.com/#computation_firstrun
  self.firstRun = true;

  self._id = nextId++;
  self._onInvalidateCallbacks = [];
  // the plan is at some point to use the parent relation
  // to constrain the order that computations are processed
  self._parent = parent;
  self._func = f;
  self._recomputing = false;

  var errored = true;
  try {
    self._compute();
    errored = false;
  } finally {
    self.firstRun = false;
    if (errored)
      self.stop();
  }
};

_assign(Deps.Computation.prototype, {

  // http://docs.meteor.com/#computation_oninvalidate
  onInvalidate: function (f) {
    var self = this;

    if (typeof f !== 'function')
      throw new Error("onInvalidate requires a function");

    if (self.invalidated) {
      Deps.nonreactive(function () {
        callWithNoYieldsAllowed(f, self);
      });
    } else {
      self._onInvalidateCallbacks.push(f);
    }
  },

  // http://docs.meteor.com/#computation_invalidate
  invalidate: function () {
    var self = this;
    if (! self.invalidated) {
      // if we're currently in _recompute(), don't enqueue
      // ourselves, since we'll rerun immediately anyway.
      if (! self._recomputing && ! self.stopped) {
        requireFlush();
        pendingComputations.push(this);
      }

      self.invalidated = true;

      // callbacks can't add callbacks, because
      // self.invalidated === true.
      for(var i = 0, f; f = self._onInvalidateCallbacks[i]; i++) {
        Deps.nonreactive(function () {
          callWithNoYieldsAllowed(f, self);
        });
      }
      self._onInvalidateCallbacks = [];
    }
  },

  // http://docs.meteor.com/#computation_stop
  stop: function () {
    if (! this.stopped) {
      this.stopped = true;
      this.invalidate();
    }
  },

  _compute: function () {
    var self = this;
    self.invalidated = false;

    var previous = Deps.currentComputation;
    setCurrentComputation(self);
    var previousInCompute = inCompute;
    inCompute = true;
    try {
      callWithNoYieldsAllowed(self._func, self);
    } finally {
      setCurrentComputation(previous);
      inCompute = false;
    }
  },

  _recompute: function () {
    var self = this;

    self._recomputing = true;
    try {
      while (self.invalidated && ! self.stopped) {
        try {
          self._compute();
        } catch (e) {
          _throwOrLog("recompute", e);
        }
        // If _compute() invalidated us, we run again immediately.
        // A computation that invalidates itself indefinitely is an
        // infinite loop, of course.
        //
        // We could put an iteration counter here and catch run-away
        // loops.
      }
    } finally {
      self._recomputing = false;
    }
  }
});

//
// http://docs.meteor.com/#deps_dependency
//
Deps.Dependency = function () {
  this._dependentsById = {};
};

_assign(Deps.Dependency.prototype, {
  // http://docs.meteor.com/#dependency_depend
  //
  // Adds `computation` to this set if it is not already
  // present.  Returns true if `computation` is a new member of the set.
  // If no argument, defaults to currentComputation, or does nothing
  // if there is no currentComputation.
  depend: function (computation) {
    if (! computation) {
      if (! Deps.active)
        return false;

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

  // http://docs.meteor.com/#dependency_changed
  changed: function () {
    var self = this;
    for (var id in self._dependentsById)
      self._dependentsById[id].invalidate();
  },

  // http://docs.meteor.com/#dependency_hasdependents
  hasDependents: function () {
    var self = this;
    for(var id in self._dependentsById)
      return true;
    return false;
  }
});

_assign(Deps, {
  // http://docs.meteor.com/#deps_flush
  flush: function (_opts) {
    // XXX What part of the comment below is still true? (We no longer
    // have Spark)
    //
    // Nested flush could plausibly happen if, say, a flush causes
    // DOM mutation, which causes a "blur" event, which runs an
    // app event handler that calls Deps.flush.  At the moment
    // Spark blocks event handlers during DOM mutation anyway,
    // because the LiveRange tree isn't valid.  And we don't have
    // any useful notion of a nested flush.
    //
    // https://app.asana.com/0/159908330244/385138233856
    if (inFlush)
      throw new Error("Can't call Deps.flush while flushing");

    if (inCompute)
      throw new Error("Can't flush inside Deps.autorun");

    inFlush = true;
    willFlush = true;
    throwFirstError = !! (_opts && _opts._throwFirstError);

    var finishedTry = false;
    try {
      while (pendingComputations.length ||
             afterFlushCallbacks.length) {

        // recompute all pending computations
        while (pendingComputations.length) {
          var comp = pendingComputations.shift();
          comp._recompute();
        }

        if (afterFlushCallbacks.length) {
          // call one afterFlush callback, which may
          // invalidate more computations
          var func = afterFlushCallbacks.shift();
          try {
            func();
          } catch (e) {
            _throwOrLog("afterFlush function", e);
          }
        }
      }
      finishedTry = true;
    } finally {
      if (! finishedTry) {
        // we're erroring
        inFlush = false; // needed before calling `Deps.flush()` again
        Deps.flush({_throwFirstError: false}); // finish flushing
      }
      willFlush = false;
      inFlush = false;
    }
  },

  // http://docs.meteor.com/#deps_autorun
  //
  // Run f(). Record its dependencies. Rerun it whenever the
  // dependencies change.
  //
  // Returns a new Computation, which is also passed to f.
  //
  // Links the computation to the current computation
  // so that it is stopped if the current computation is invalidated.
  autorun: function (f) {
    if (typeof f !== 'function')
      throw new Error('Deps.autorun requires a function argument');

    constructingComputation = true;
    var c = new Deps.Computation(f, Deps.currentComputation);

    if (Deps.active)
      Deps.onInvalidate(function () {
        c.stop();
      });

    return c;
  },

  // http://docs.meteor.com/#deps_nonreactive
  //
  // Run `f` with no current computation, returning the return value
  // of `f`.  Used to turn off reactivity for the duration of `f`,
  // so that reactive data sources accessed by `f` will not result in any
  // computations being invalidated.
  nonreactive: function (f) {
    var previous = Deps.currentComputation;
    setCurrentComputation(null);
    try {
      return f();
    } finally {
      setCurrentComputation(previous);
    }
  },

  // http://docs.meteor.com/#deps_oninvalidate
  onInvalidate: function (f) {
    if (! Deps.active)
      throw new Error("Deps.onInvalidate requires a currentComputation");

    Deps.currentComputation.onInvalidate(f);
  },

  // http://docs.meteor.com/#deps_afterflush
  afterFlush: function (f) {
    afterFlushCallbacks.push(f);
    requireFlush();
  }
});
