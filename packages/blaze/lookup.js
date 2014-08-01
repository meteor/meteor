var bindIfIsFunction = function (x, target) {
  if (typeof x !== 'function')
    return x;
  return function () {
    return x.apply(target, arguments);
  };
};

// If `x` is a function, binds the value of `this` for that function
// to the current data context.
var bindDataContext = function (x) {
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

// !!! FIX THIS COMMENT !!!
//
// Implements {{foo}} where `name` is "foo"
// and `component` is the component the tag is found in
// (the lexical "self," on which to look for methods).
// If a function is found, it is bound to the object it
// was found on.  Returns a function,
// non-function value, or null.
//
// NOTE: This function must not establish any reactive
// dependencies.  If there is any reactivity in the
// value, lookup should return a function.
Blaze.View.prototype.lookup = function (name, _options) {
  var template = this.template;
  var lookupTemplate = _options && _options.template;

  if (/^\./.test(name)) {
    // starts with a dot. must be a series of dots which maps to an
    // ancestor of the appropriate height.
    if (!/^(\.)+$/.test(name))
      throw new Error("id starting with dot must be a series of dots");

    return Blaze._parentData(name.length - 1, true /*_functionWrapped*/);

  } else if (template && (name in template)) {
    return wrapHelper(bindDataContext(template[name]));
  } else if (lookupTemplate && Template.__lookup__(name)) {
    return Template.__lookup__(name);
  } else if (UI._globalHelpers[name]) {
    return wrapHelper(bindDataContext(UI._globalHelpers[name]));
  } else {
    return function () {
      var isCalledAsFunction = (arguments.length > 0);
      var data = Blaze.getCurrentData();
      if (lookupTemplate && ! (data && data[name])) {
        throw new Error("No such template: " + name);
      }
      if (isCalledAsFunction && ! (data && data[name])) {
        throw new Error("No such function: " + name);
      }
      if (! data)
        return null;
      var x = data[name];
      if (typeof x !== 'function') {
        if (isCalledAsFunction) {
          throw new Error("Can't call non-function: " + x);
        }
        return x;
      }
      return x.apply(data, arguments);
    };
  }
  return null;
};

// Implement Spacebars' {{../..}}.
// @param height {Number} The number of '..'s
Blaze._parentData = function (height, _functionWrapped) {
  var theWith = Blaze.getCurrentView('with');
  for (var i = 0; (i < height) && theWith; i++) {
    theWith = Blaze.getParentView(theWith, 'with');
  }

  if (! theWith)
    return null;
  if (_functionWrapped)
    return function () { return theWith.dataVar.get(); };
  return theWith.dataVar.get();
};


Blaze.View.prototype.lookupTemplate = function (name) {
  return this.lookup(name, {template:true});
};
