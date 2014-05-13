// Create an empty template object. Packages and apps add templates on
// to this object.
Template = {};

Template.__define__ = function (templateName, renderFunc) {
  if (Template.hasOwnProperty(templateName))
    throw new Error("There are multiple templates named '" + templateName + "'. Each template needs a unique name.");

  var templateClass = UI.Component2.extend({
    render: renderFunc
  });

  Template[templateName] = templateClass.prototype;
};
