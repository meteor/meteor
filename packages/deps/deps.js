if (typeof Sky === "undefined") Sky = {};

(function () {
  var pending_invalidate = [];
  var next_id = 1;

  var Context = function () {
    // Each context has a unique number. You can use this to avoid
    // storing multiple copies of the same context in your
    // invalidation list.
    this.id = next_id++;
    this._callbacks = [];
    this._invalidated = false;
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
      if (!this._invalidated) {
        this._invalidated = true;
        if (!pending_invalidate.length)
          setTimeout(Sky.flush, 0);
        pending_invalidate.push(this);
      }
    },

    // calls f immediately if this context was already invalidated
    on_invalidate: function (f) {
      if (this._invalidated)
        f();
      else
        this._callbacks.push(f);
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
        _.each(ctx._callbacks, function (f) {
          f(); // XXX wrap in try?
        });
        delete ctx._callbacks; // maybe help the GC
      });
    },

    deps: {
      Context: Context
    }
  });
})();
