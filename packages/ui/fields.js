
var global = (function () { return this; })();

// Searches for the given property in `comp` or a parent,
// and returns it as is (without call it if it's a function).
var lookupComponentProp = function (comp, prop) {
  comp = findComponentWithProp(prop, comp);
  var result = (comp ? comp.data : null);
  if (typeof result === 'function')
    result = _.bind(result, comp);
  return result;
};

// Component that's a no-op when used as a block helper like
// `{{#foo}}...{{/foo}}`.
var noOpComponent = Component.extend({
  kind: 'NoOp',
  render: function (buf) {
    buf.write(this.content);
  }
});

// This map is searched first when you do something like `{{#if}}` in
// a template.
var builtInComponents = {
  'if': UI.If,
  'each': UI.Each,
  'unless': UI.Unless,
  'with': UI.With,
  // for past compat:
  'constant': noOpComponent,
  'isolate': noOpComponent
};

_extend(UI.Component, {
  lookup: function (id) {
    var self = this;
    var result;
    var comp;

    if (!id)
      throw new Error("must pass id to lookup");

    if (/^\./.test(id)) {
      // starts with a dot. must be a series of dots which maps to an
      // ancestor of the appropriate height.
      if (!/^(\.)+$/.test(id)) {
        throw new Error("id starting with dot must be a series of dots");
      }

      var compWithData = findComponentWithProp('data', self);
      for (var i = 1; i < id.length; i++) {
        compWithData = compWithData ? findComponentWithProp('data', compWithData.parent) : null;
      }

      return compWithData.data;

    } else if ((comp = findComponentWithProp(id, self))) {
      // found a property or method of a component
      // (`self` or one of its ancestors)
      var result = comp[id];

    } else if (_.has(builtInComponents, id)) {
      return builtInComponents[id];
    // Code to search the global namespace for capitalized names
    // like component classes, `Template`, `StringUtils.foo`,
    // etc.
    //
    // } else if (/^[A-Z]/.test(id) && (id in global)) {
    //   // Only look for a global identifier if `id` is
    //   // capitalized.  This avoids having `{{name}}` mean
    //   // `window.name`.
    //   result = global[id];
    //   return function (/*arguments*/) {
    //     var data = getComponentData(self);
    //     if (typeof result === 'function')
    //       return result.apply(data, arguments);
    //     return result;
    //   };
    } else if (Handlebars._globalHelpers[id]) {
      // Backwards compatibility for helpers defined with
      // `Handlebars.registerHelper`. XXX what is the future pattern
      // for this? We should definitely not put it on the Handlebars
      // namespace.
      result = Handlebars._globalHelpers[id];
    } else {
      // Resolve id `foo` as `data.foo` (with a "soft dot").
      return function (/*arguments*/) {
        var data = getComponentData(self);
        if (! data)
          return data;
        var result = data[id];
        if (typeof result === 'function')
          return result.apply(data, arguments);
        return result;
      };
    }

    if (typeof result === 'function') {
      return function (/*arguments*/) {
        var data = getComponentData(self);
        return result.apply(data, arguments);
      };
    } else {
      return result;
    };
  },
  get: function (id) {
    // support `this.get()` to get the data context.
    if (id === undefined)
      id = ".";

    var result = this.lookup(id);
    return (typeof result === 'function' ? result() : result);
  },
  set: function (id, value) {
    var comp = findComponentWithProp(id, this);
    if (! comp || ! comp[id])
      throw new Error("Can't find field: " + id);
    if (typeof comp[id] !== 'function')
      throw new Error("Not a settable field: " + id);
    comp[id](value);
  }
});
