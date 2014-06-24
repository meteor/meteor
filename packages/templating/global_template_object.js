// Create an empty template object. Packages and apps add templates on
// to this object.
Template = {};

Template.__define__ = function (templateName, templateFunc) {
  if (Template.hasOwnProperty(templateName))
    throw new Error("There are multiple templates named '" + templateName + "'. Each template needs a unique name.");

  var templateClass = function TemplateComponent() {
    UI.TemplateComponent.apply(this, arguments);
  };
  JSClass.inherits(templateClass, UI.TemplateComponent);
  templateClass.prototype.templateName = templateName;
  templateClass.prototype.renderTemplate = templateFunc;

  Template[templateName] = templateClass.prototype;
};
