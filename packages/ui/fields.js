
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

_extend(UI.Component, {
  get: function (id) {
    if (! id) {
      // `id` is `""` or absent/undefined
      return getData(this);
    } else {
      var comp = findComponentWithProp(id, this);
      if (comp) {
        // found a method
        return (typeof comp[id] === 'function' ?
                comp[id]() : comp[id]);
      } else {
        var data = getData(this);
        return data[id];
      }
    }
  },
  // convenient syntax
  withData: function (data) {
    return this.extend({data: data});
  }
});
