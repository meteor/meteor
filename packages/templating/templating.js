

// Packages and apps add templates on to this object.
Template = Blaze.Template;

// Like `Template[name] = template` but also checks for duplicates
// and illegal template names that won't work.
Template.__assign = function (name, template) {
  if (name in Template) {
    if (Template[name] instanceof Template)
      throw new Error("There are multiple templates named '" + name + "'. Each template needs a unique name.");
    throw new Error("This template name is reserved: " + name);
  }

  Template[name] = template;
};

UI._templateInstance = function () {
  var templateView = Blaze.getCurrentTemplateView();
  if (! templateView)
    throw new Error("No current template");

  return Template.updateTemplateInstance(templateView);
};

// Define a template `Template._body_` that renders its
// `contentViews`.  `<body>` tags (of which there may be
// multiple) will have their contents added to it.
Template.__assign('_body_', new Template('_body_', function () {
  var parts = Template._body_.contentViews;
  // enable lookup by setting `view.template`
  for (var i = 0; i < parts.length; i++)
    parts[i].template = Template._body_;
  return parts;
}));
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

  var range = UI.render(Template._body_);
  Template._body_.view = range.view;
  UI.insert(range, document.body);
};

// Renders a template (eg `Template.foo`), returning a DOMRange. The
// range will keep updating reactively.
UI.render = function (tmpl) {
  if (! (tmpl instanceof Template))
    throw new Error("Template required here");

  return Blaze.render(tmpl);
};

// Same as `UI.render` with a data context passed in.
UI.renderWithData = function (tmpl, data) {
  if (! (tmpl instanceof Template))
    throw new Error("Template required here");
  if (typeof data === 'function')
    throw new Error("Data argument can't be a function"); // XXX or can it?

  return Blaze.render(Blaze.With(data, function () {
    return tmpl;
  }));
};

// The publicly documented API for inserting a DOMRange returned from
// `UI.render` or `UI.renderWithData` into the DOM. If you then remove
// `parentElement` using jQuery, all reactive updates on the rendered
// template will stop.
UI.insert = function (range, parentElement, nextNode) {
  // parentElement must be a DOM node. in particular, can't be the
  // result of a call to `$`. Can't check if `parentElement instanceof
  // Node` since 'Node' is undefined in IE8.
  if (! parentElement || typeof parentElement.nodeType !== 'number')
    throw new Error("'parentElement' must be a DOM node");
  if (nextNode && typeof nextNode.nodeType !== 'number') // 'nextNode' is optional
    throw new Error("'nextNode' must be a DOM node");
  if (! range instanceof Blaze._DOMRange)
    throw new Error("Expected template rendered with UI.render");

  range.attach(parentElement, nextNode);
};

// XXX test and document
UI.remove = function (range) {
  if (! range instanceof Blaze._DOMRange)
    throw new Error("Expected template rendered with UI.render");

  if (range.attached)
    range.detach();
  range.destroy();
};

UI.body = Template._body_;
