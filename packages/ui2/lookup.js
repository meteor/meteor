
var global = (function () { return this; })();

var findComponentWithProp = function (id, comp) {
  while (comp) {
    if (id in comp)
      return comp;
    comp = comp.parent;
  }
  return null;
};

Component.include({
  lookup: function (id) {
    var self = this;

    var result = null;
    var thisToBind = null;

    // XXX figure out what this should really do,
    // and how custom component classes should
    // hook into this behavior.

    var cmp;
    if (! id) {
      result = self.data();
    } else if ((cmp = findComponentWithProp(id, self))) {
      result = cmp[id];
      thisToBind = cmp;
    } else if (id === 'if') {
      result = UI.If;
    } else if (id === 'each') {
      result = UI.Each;
    } else if (id === 'unless') {
      result = UI.Unless;
    } else if (id === 'with') {
      result = Component;
    } else if (/^[A-Z]/.test(id) && (id in global)) {
      // Only look for a global identifier if `id` is
      // capitalized.  This avoids have `{{name}}` mean
      // `window.name`.
      result = global[id];
      thisToBind = self.data();
    } else {
      // check `data()` last, because it establishes
      // a dependency.
      var data = self.data();
      if (data != null) {
        thisToBind = data;
        result = data[id];
      }
    }

    if (thisToBind &&
        typeof result === 'function' &&
        ! Component.isType(result))
      return _.bind(result, thisToBind);

    return result;
  }
});
