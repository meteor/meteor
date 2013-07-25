
var findComponentWithProp = function (id, comp) {
  while (comp) {
    if (id in comp)
      return comp;
    comp = comp.parent;
  }
  return null;
};

var getData = function (comp) {
  comp = findComponentWithProp('data', comp);
  return (comp ?
          (typeof comp.data === 'function' ?
           comp.data() : comp.data) :
          null);
};

var global = (function () { return this; })();

_extend(UI.Component, {
  // _dontCall is for internal use only.
  //
  // XXX `get` will probably take multiple arguments (forming a path)
  get: function (id, _dontCall) {
    var self = this;

    var result = null;
    var thisToBind = null;

    var comp;
    if (! id) {
      // `id` is `""` or absent/undefined
      result = getData(self);
    } else if ((comp = findComponentWithProp(id, self))) {
      // found a method
      result = comp[id];
      thisToBind = comp;
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
      thisToBind = getData(self);
    } else {
      // check `data()` last, because it establishes
      // a dependency.
      var data = getData(self);
      if (data != null) {
        thisToBind = data;
        result = data[id];
      }
    }

    if (typeof result !== 'function')
      return result;

    if (_dontCall === true)
      // XXX underscore dependency
      return (thisToBind ? _.bind(result, thisToBind) : result);

    return (thisToBind ? result.call(thisToBind) : result());
  },
  lookup: function (id) {
    return this.get(id, true);
  },
  // convenient syntax
  withData: function (data) {
    return this.extend({data: data});
  }
});
