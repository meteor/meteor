
// Packages and apps add templates on to this object.
Template = Blaze.Template;

// Check for duplicate template names and illegal names that won't work.
Template.__checkName = function (name) {
  if (name in Template) {
    if ((Template[name] instanceof Template) && name !== "body")
      throw new Error("There are multiple templates named '" + name + "'. Each template needs a unique name.");
    throw new Error("This template name is reserved: " + name);
  }
};

// XXX COMPAT WITH 0.8.3
Template.__define__ = function (name, renderFunc) {
  Template.__checkName(name);
  Template[name] = new Template("Template." + name, renderFunc);
};

// Define a template `Template.body` that renders its
// `contentViews`.  `<body>` tags (of which there may be
// multiple) will have their contents added to it.
Template.body = new Template('body', function () {
  var parts = Template.body.contentViews;
  // enable lookup by setting `view.template`
  for (var i = 0; i < parts.length; i++)
    parts[i].template = Template.body;
  return parts;
});
Template.body.contentViews = []; // array of Blaze.Views
Template.body.view = null;

// XXX COMPAT WITH 0.9.0
// (<body> tags in packages built with 0.9.0)
Template.__body__ = Template.body;
Template.__body__.__contentParts = Template.body.contentViews;
Template.__body__.__instantiate = Template.body.renderToDocument;

Template.body.addContent = function (renderFunc) {
  var kind = 'body_content_' + Template.body.contentViews.length;

  Template.body.contentViews.push(Blaze.View(kind, renderFunc));
};

// This function does not use `this` and so it may be called
// as `Meteor.startup(Template.body.renderIntoDocument)`.
Template.body.renderToDocument = function () {
  // Only do it once.
  if (Template.body.view)
    return;

  var view = UI.render(Template.body, document.body);
  Template.body.view = view;
};

// back-compat (we no longer document UI.body)
UI.body = Template.body;
