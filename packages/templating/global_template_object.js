// Create an empty template object. Packages and apps add templates on
// to this object.
Template = {};

// `Template` is not a function so this is not a real function prototype,
// but it is used as the prototype of all `Template.foo` objects.
// Naming a template "prototype" will cause an error.
Template.prototype = (function () {
  // IE 8 exposes function names in the enclosing scope, so
  // use this IIFE to catch it.
  return (function Template() {}).prototype;
})();

Template.prototype.__makeView = function (contentFunc, elseFunc) {
  var view = Blaze.View('Template.' + this.__templateName, this.__render);
  view.template = this;
  view.templateContentBlock = contentFunc ? { __makeView: function () {
    return Blaze.View('(contentBlock)', contentFunc);
  } } : null;
  view.templateElseBlock = elseFunc ? { __makeView: function () {
    return Blaze.View('(elseBlock)', elseFunc);
  } } : null;
  return view;
};

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

// Implements {{foo}} where `name` is "foo"
// and `component` is the component the tag is found in
// (the lexical "self," on which to look for methods).
// If a function is found, it is bound to the object it
// was found on.  Returns a function,
// non-function value, or null.
Template.prototype.__lookup = function (name, options) {
  var template = this;
  var lookupTemplate = options && options.template;

  if (/^\./.test(name)) {
    // starts with a dot. must be a series of dots which maps to an
    // ancestor of the appropriate height.
    if (!/^(\.)+$/.test(name))
      throw new Error("id starting with dot must be a series of dots");

    var theWith = Blaze.getCurrentView('with');
    for (var i = 1; (i < name.length) && theWith; i++)
      theWith = Blaze.getParentView(theWith, 'with');

    return (theWith ? theWith.dataVar.get() : null);

  } else if (name in template) {
    return bindToCurrentDataIfIsFunction(template[name]);
  } else if (lookupTemplate && _hasOwnProperty.call(Template, name)) {
    return Template[name];
  } else if (UI._globalHelpers[name]) {
    return bindToCurrentDataIfIsFunction(UI._globalHelpers[name]);
  } else {
    var data = Blaze.getCurrentData();
    if (data)
      return bindIfIsFunction(data[name], data);
  }
  return null;
};

Template.prototype.__lookupTemplate = function (name) {
  var result = this.__lookup(name, {template:true});

  if (! result)
    throw new Error("No such template: " + name);
  return result;
};

var _hasOwnProperty = Object.prototype.hasOwnProperty;

Template.__define__ = function (templateName, templateFunc) {
  if (_hasOwnProperty.call(Template, templateName)) {
    if (Template[templateName].__makeView)
      throw new Error("There are multiple templates named '" + templateName + "'. Each template needs a unique name.");
    throw new Error("This template name is reserved: " + templateName);
  }

  var tmpl = new Template.prototype.constructor;
  tmpl.__templateName = templateName;
  tmpl.__render = templateFunc;

  Template[templateName] = tmpl;
};

// Define a template `Template.__body__` that renders its
// `__contentParts`.
Template.__define__('__body__', function () {
  var parts = Template.__body__.__contentParts;
  // enable lookup by setting `view.template`
  for (var i = 0; i < parts.length; i++)
    parts[i].template = Template.__body__;
  return parts;
});
Template.__body__.__contentParts = []; // array of Blaze.Views

// Define `Template.__body__.__instantiate()` as a function that
// renders `Template.__body__` into `document.body`, at most once
// (calling it a second time does nothing).  This function does
// not use `this`, so you can safely call:
// `Meteor.startup(Template.__body__.__instantiate)`.
Template.__body__.__isInstantiated = false;
var instantiateBody = function () {
  if (Template.__body__.__isInstantiated)
    return;
  Template.__body__.__isInstantiated = true;
  var view = Template.__body__.__makeView();
  Template.__body__.__view = view;
  Blaze.materializeView(view).attach(document.body);
};
Template.__body__.__instantiate = instantiateBody;
