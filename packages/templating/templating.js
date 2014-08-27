

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

// Define a template `Template._body_` that renders its
// `contentViews`.  `<body>` tags (of which there may be
// multiple) will have their contents added to it.
Template._body_ = new Template('_body_', function () {
  var parts = Template._body_.contentViews;
  // enable lookup by setting `view.template`
  for (var i = 0; i < parts.length; i++)
    parts[i].template = Template._body_;
  return parts;
});
Template._body_.contentViews = []; // array of Blaze.Views
Template._body_.view = null;

Template._body_.addContent = function (renderFunc) {
  var kind = 'body_content_' + Template._body_.contentViews.length;

  Template._body_.contentViews.push(Blaze.View(kind, renderFunc));
};

// This function does not use `this` and so it may be called
// as `Meteor.startup(Template._body_.renderIntoDocument)`.
Template._body_.renderToDocument = function () {
  // Only do it once.
  if (Template._body_.view)
    return;

  var view = UI.render(Template._body_, document.body);
  Template._body_.view = view;
};

UI.body = Template._body_;
