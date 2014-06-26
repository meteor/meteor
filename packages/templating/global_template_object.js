// Create an empty template object. Packages and apps add templates on
// to this object.
Template = {};

Template.__define__ = function (templateName, templateFunc) {
  if (Template.hasOwnProperty(templateName))
    throw new Error("There are multiple templates named '" + templateName + "'. Each template needs a unique name.");

  var tmpl = {
    __templateName: templateName,
    __createView: function () {
      return Blaze.View('Template.' + templateName, templateFunc);
    }
  };

  Template[templateName] = tmpl;
};

// Define a template `Template.__body__` that renders its
// `__contentParts`.
Template.__define__('__body__', function () {
  return Template.__body__.__contentParts;
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
  Blaze.materializeView(Template.__body__.__createView()).attach(document.body);
};
Template.__body__.__instantiate = instantiateBody;
