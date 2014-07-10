var bindIfIsFunction = function (x, target) {
  if (typeof x !== 'function')
    return x;
  return function () {
    return x.apply(target, arguments);
  };
};

var bindToCurrentDataIfIsFunction = function (x) {
  if (typeof x === 'function') {
    return function () {
      var data = Blaze.getCurrentData();
      if (data == null)
        data = {};
      return x.apply(data, arguments);
    };
  }
  return x;
};

var wrapHelper = function (f) {
  return Blaze.wrapCatchingExceptions(f, 'template helper');
};

// Implements {{foo}} where `name` is "foo"
// and `component` is the component the tag is found in
// (the lexical "self," on which to look for methods).
// If a function is found, it is bound to the object it
// was found on.  Returns a function,
// non-function value, or null.
Blaze.View.prototype.lookup = function (name, _options) {
  var template = this.template;
  var lookupTemplate = _options && _options.template;

  if (/^\./.test(name)) {
    // starts with a dot. must be a series of dots which maps to an
    // ancestor of the appropriate height.
    if (!/^(\.)+$/.test(name))
      throw new Error("id starting with dot must be a series of dots");

    return Blaze._parentData(name.length - 1);

  } else if (template && (name in template)) {
    return wrapHelper(bindToCurrentDataIfIsFunction(template[name]));
  } else if (lookupTemplate && Template.__lookup__(name)) {
    return Template.__lookup__(name);
  } else if (UI._globalHelpers[name]) {
    return wrapHelper(bindToCurrentDataIfIsFunction(UI._globalHelpers[name]));
  } else {
    var data = Blaze.getCurrentData();
    if (data)
      return wrapHelper(bindIfIsFunction(data[name], data));
  }
  return null;
};

// Implement Spacebars' {{../..}}.
// @param height {Number} The number of '..'s
Blaze._parentData = function (height) {
  var theWith = Blaze.getCurrentView('with');
  for (var i = 0; (i < height) && theWith; i++) {
    theWith = Blaze.getParentView(theWith, 'with');
  }

  return (theWith ? theWith.dataVar.get() : null);
};


Blaze.View.prototype.lookupTemplate = function (name) {
  var result = this.lookup(name, {template:true});

  if (! result)
    throw new Error("No such template: " + name);
  return result;
};
