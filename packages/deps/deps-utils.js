(function () {

  // Constructor for an empty ContextSet.
  var ContextSet = function () {
    this._contextsById = {};
  };

  // Adds the Context `ctx` to the set (if it is
  // not already present).  The Context will only
  // remain in the set as long as it has not been
  // invalidated.
  // Returns true if the context was newly added.
  ContextSet.prototype.add = function (ctx) {
    var self = this;
    if (ctx && ! (ctx.id in self._contextsById)) {
      self._contextsById[ctx.id] = ctx;
      ctx.on_invalidate(function () {
        delete self._contextsById[ctx.id];
      });
      return true;
    }
    return false;
  };

  // Invalidate all Contexts in the set and remove
  // them from the set.
  ContextSet.prototype.invalidateAll = function () {
    var self = this;
    for (var id in self._contextsById)
      self._contextsById[id].invalidate();
  };

  // Returns true if there are no Contexts in this set.
  ContextSet.prototype.isEmpty = function () {
    var self = this;
    for(var id in self._contextsById)
      return false;
    return true;
  };

  Meteor.deps.ContextSet = ContextSet;
})();