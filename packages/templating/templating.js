
// Packages and apps add templates on to this object.
Template = Blaze.Template;

// Check for duplicate template names and illegal names that won't work.
Template.__checkName = function (name) {
  if (name in Template) {
    if (Template[name] instanceof Template)
      throw new Error("There are multiple templates named '" + name + "'. Each template needs a unique name.");
    throw new Error("This template name is reserved: " + name);
  }
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
