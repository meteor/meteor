var isTemplate = function (t) {
  return (t instanceof UI.TemplateComponent) && (t.constructor.prototype === t);
};

// Renders a template (eg `Template.foo`), returning a DOMRange. The
// range will keep updating reactively.
UI.render = function (tmpl) {
  if (! isTemplate(tmpl))
    throw new Error("Template required here");

  return Blaze.renderComponent(tmpl).domrange;
};

// Same as `UI.render` with a data context passed in.
UI.renderWithData = function (tmpl, data) {
  if (! isTemplate(tmpl))
    throw new Error("Template required here");
  if (typeof data === 'function')
    throw new Error("Data argument can't be a function"); // XXX or can it?

  return Blaze.render(function () {
    return Blaze.With(data, function () {
      return tmpl.render();
    });
  });
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
  if (! range instanceof Blaze.DOMRange)
    throw new Error("Expected template rendered with UI.render");

  range.attach(parentElement, nextNode);
};

