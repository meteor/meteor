
var global = (function () { return this; })();

// XXXXXXXX take out the "look up the tree" logic for Stage I

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
      result = getComponentData(self);
    } else if ((comp = findComponentWithProp(id, self))) {
      // found a method
      result = comp[id];
      thisToBind = getComponentData(self);
    } else if (id === 'if') {
      result = UI.If;
    } else if (id === 'each') {
      result = UI.Each;
    } else if (id === 'unless') {
      result = UI.Unless;
    } else if (id === 'with') {
      result = UI.With;
    } else if (id === 'constant' || id === 'isolate') {
      // XXX PAST
      result = Component.extend({
        kind: 'PastCompat',
        render: function (buf) {
          buf.write(this.content);
        }
      });
    } else if (/^[A-Z]/.test(id) && (id in global)) {
      // Only look for a global identifier if `id` is
      // capitalized.  This avoids have `{{name}}` mean
      // `window.name`.
      result = global[id];
      thisToBind = getComponentData(self);
    } else {
      // check `data()` last, because it establishes
      // a dependency.
      var data = getComponentData(self);
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
  set: function (id, value) {
    var comp = findComponentWithProp(id, this);
    if (! comp || ! comp[id])
      throw new Error("Can't find field: " + id);
    if (typeof comp[id] !== 'function')
      throw new Error("Not a settable field: " + id);
    comp[id](value);
  },
  // convenient syntax
  withData: function (data) {
    return this.extend({data: data});
  }
});
