
var global = (function () { return this; })();

Component.include({
  lookup: function (id) {
    var self = this;

    var result = null;
    var thisToBind = null;

    // XXX figure out what this should really do,
    // and how custom component classes should
    // hook into this behavior.

    if (! id) {
      result = self.data();
    } else if (id in self) {
      result = self[id];
      thisToBind = self;
    } else if (id === 'if') {
      result = UI.If;
    } else if (id === 'each') {
      result = UI.Each;
    } else if (id === 'unless') {
      result = UI.Unless;
    } else if (id === 'with') {
      result = Component;
    } else if (id in global) {
      result = global[id];
      thisToBind = self.data();
    } else {
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
