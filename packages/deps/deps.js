if (typeof Sky === "undefined") Sky = {};

(function () {
  var pending_invalidate = [];
  var next_id = 1;

  var Context = function () {
    this.callbacks = [];
    this.invalidated = false;
    this.id = next_id++;
  };
  Context.current = null;

  _.extend(Context.prototype, {
    run: function (f) {
      var previous = Context.current;
      Context.current = this;
      try { var ret = f(); }
      finally { Context.current = previous; }
      return ret;
    },

    // we specifically guarantee that this doesn't call any
    // invalidation functions (before returning) -- it just marks the
    // context as invalidated.
    invalidate: function () {
      if (!this.invalidated) {
        this.invalidated = true;
        if (!pending_invalidate.length)
          setTimeout(Sky.flush, 0);
        pending_invalidate.push(this);
      }
    },

    // calls f immediately if this context was already invalidated
    on_invalidate: function (f) {
      if (this.invalidated)
        f();
      else
        this.callbacks.push(f);
    },

    // obj should be an object. true iff once() has never been called
    // on this context with this object as the argument. modifies obj
    // by adding a property named '_once'.
    once: function (obj) {
      obj._once = obj._once || {};
      if (this.id in obj._once)
        return false;
      obj._once[this.id] = true;
      this.on_invalidate(function () {
        delete obj._once[this.id];
      });
      return true;
    }
  });

  _.extend(Sky, {
    // XXX specify what happens when flush calls flush. eg, flushing
    // causes a dom update, which causes onblur, which invokes an
    // event handler that calls flush. it's probably an exception --
    // no flushing from inside onblur. can also imagine routing onblur
    // through settimeout(0), which is probably what the user wants.
    flush: function () {
      var pending = pending_invalidate;
      pending_invalidate = [];

      _.each(pending, function (ctx) {
        _.each(ctx.callbacks, function (f) {
          f(); // XXX wrap in try?
        });
        delete this.callbacks; // maybe help the GC
      });
    },

    deps: {
      Context: Context
    }
  });
})();