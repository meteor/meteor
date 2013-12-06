// Create an empty template object. Packages and apps add templates on
// to this object.
Template = {};

Template.__define__ = function (templateName, renderFunc) {
  if (Template.hasOwnProperty(templateName))
    throw new Error("Can't have two templates named: " + templateName);

  Template[templateName] = UI.Component.extend({
    kind: "Template_" + templateName,
    render: renderFunc
  });
};
