// Create an empty template object. Packages and apps add templates on
// to this object.
Template = {};

Template.__define__ = function (templateName, templateFunc) {
  if (Template.hasOwnProperty(templateName))
    throw new Error("There are multiple templates named '" + templateName + "'. Each template needs a unique name.");

  var templateClass = UI.TemplateComponent.extend({
    templateName: templateName,
    constructor: function TemplateComponent() {
      UI.TemplateComponent.apply(this, arguments);
    },
    renderTemplate: templateFunc
  });

  Template[templateName] = templateClass.prototype;
};
