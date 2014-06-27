// Create an empty template object. Packages and apps add templates on
// to this object.
Template = {};

Template.__define__ = function (templateName, templateFunc) {
  if (Template.hasOwnProperty(templateName))
    throw new Error("There are multiple templates named '" + templateName + "'. Each template needs a unique name.");

  var tmpl = {
    __templateName: templateName,
    __render: templateFunc,
    __makeView: function (contentFunc, elseFunc) {
      var view = Blaze.View('Template.' + templateName, tmpl.__render);
      view.template = tmpl;
      view.templateContentBlock = contentFunc ? { __makeView: function () {
        return Blaze.View('(contentBlock)', contentFunc);
      } } : null;
      view.templateElseBlock = elseFunc ? { __makeView: function () {
        return Blaze.View('(elseBlock)', elseFunc);
      } } : null;
      return view;
    },
    // Implements {{foo}} where `name` is "foo"
    // and `component` is the component the tag is found in
    // (the lexical "self," on which to look for methods).
    // If a function is found, it is bound to the object it
    // was found on.  Returns a function,
    // non-function value, or null.
    __lookup: function (name, options) {
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
        return Blaze._bindToCurrentDataIfIsFunction(template[name]);
      } else if (lookupTemplate && _.has(Template, name)) {
        return Template[name];
      } else if (UI._globalHelpers[name]) {
        return Blaze._bindToCurrentDataIfIsFunction(UI._globalHelpers[name]);
      } else {
        var data = Blaze.getCurrentData();
        if (data)
          return Blaze._bindIfIsFunction(data[name], data);
      }
      return null;
    },
    __lookupTemplate: function (name) {
      var result = this.__lookup(name, {template:true});

      if (! result)
        throw new Error("No such template: " + name);
      return result;
    }
  };

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
