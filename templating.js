// Create an empty template object. Packages and apps add templates on
// to this object.
Template = {};

// `Template` is not a function so this is not a real function prototype,
// but it is used as the prototype of all `Template.foo` objects.
// Naming a template "prototype" will cause an error.

/**
 * @summary Template "class"
 * @class Template
 * @instanceName template
 */
Template.prototype = (function () {
  // IE 8 exposes function names in the enclosing scope, so
  // use this IIFE to catch it.
  return (function Template() {}).prototype;
})();

/**
 * @summary Specify template helpers available to this template.
 * @locus Client
 * @param {Object} helpers Dictionary of helper functions by name.
 */
Template.prototype.helpers = function (dict) {
  for (var k in dict)
    this[k] = dict[k];
};

Template.__updateTemplateInstance = function (view) {
  // Populate `view.templateInstance.{firstNode,lastNode,data}`
  // on demand.
  var tmpl = view._templateInstance;
  if (! tmpl) {
    tmpl = view._templateInstance = {
      $: function (selector) {
        if (! view.domrange)
          throw new Error("Can't use $ on component with no DOM");
        return view.domrange.$(selector);
      },
      findAll: function (selector) {
        return Array.prototype.slice.call(this.$(selector));
      },
      find: function (selector) {
        var result = this.$(selector);
        return result[0] || null;
      },
      data: null,
      firstNode: null,
      lastNode: null,
      autorun: function (f) {
        return view.autorun(f);
      },
      __view__: view
    };
  }

  tmpl.data = Blaze.getViewData(view);

  if (view.domrange && !view.isDestroyed) {
    tmpl.firstNode = view.domrange.firstNode();
    tmpl.lastNode = view.domrange.lastNode();
  } else {
    // on 'created' or 'destroyed' callbacks we don't have a DomRange
    tmpl.firstNode = null;
    tmpl.lastNode = null;
  }

  return tmpl;
};

UI._templateInstance = function () {
  var templateView = Blaze.getCurrentTemplateView();
  if (! templateView)
    throw new Error("No current template");

  return Template.__updateTemplateInstance(templateView);
};

/**
 * @summary Specify event handlers for this template.
 * @locus Client
 * @param {Object.<String, Function>} eventMap Event handlers to associate with this template.
 */
Template.prototype.events = function (eventMap) {
  var template = this;
  template.__eventMaps = (template.__eventMaps || []);
  var eventMap2 = {};
  for (var k in eventMap) {
    eventMap2[k] = (function (k, v) {
      return function (event/*, ...*/) {
        var view = this; // passed by EventAugmenter
        var data = Blaze.getElementData(event.currentTarget);
        if (data == null)
          data = {};
        var args = Array.prototype.slice.call(arguments);
        var tmplInstance = Template.__updateTemplateInstance(view);
        args.splice(1, 0, tmplInstance);
        return v.apply(data, args);
      };
    })(k, eventMap[k]);
  }

  template.__eventMaps.push(eventMap2);
};

Template.prototype.__makeView = function (contentFunc, elseFunc) {
  var template = this;
  var view = Blaze.View(this.__viewName, this.__render);
  view.template = template;

  view.templateContentBlock = (
    contentFunc ? Template.__create__('(contentBlock)', contentFunc) : null);
  view.templateElseBlock = (
    elseFunc ? Template.__create__('(elseBlock)', elseFunc) : null);

  if (template.__eventMaps ||
      typeof template.events === 'object') {
    view.onMaterialized(function () {
      if (! template.__eventMaps &&
          typeof template.events === "object") {
        // Provide limited back-compat support for `.events = {...}`
        // syntax.  Pass `template.events` to the original `.events(...)`
        // function.  This code must run only once per template, in
        // order to not bind the handlers more than once, which is
        // ensured by the fact that we only do this when `__eventMaps`
        // is falsy, and we cause it to be set now.
        Template.prototype.events.call(template, template.events);
      }

      _.each(template.__eventMaps, function (m) {
        Blaze._addEventMap(view, m, view);
      });
    });
  }

  if (template.__initView)
    template.__initView(view);

  /**
   * @summary Provide a callback when an instance of a template is created.
   * @locus Client
   * @memberOf Template
   * @instance
   * @member {Function}
   */
  if (template.created) {
    view.onCreated(function () {
      var inst = Template.__updateTemplateInstance(view);
      template.created.call(inst);
    });
  }

  /**
   * @summary Provide a callback when an instance of a template is rendered.
   * @locus Client
   * @memberOf Template
   * @instance
   * @member {Function}
   */
  if (template.rendered) {
    view.onRendered(function () {
      var inst = Template.__updateTemplateInstance(view);
      template.rendered.call(inst);
    });
  }

  /**
   * @summary Provide a callback when an instance of a template is destroyed.
   * @locus Client
   * @instance
   * @member {Function}
   */
  if (template.destroyed) {
    view.onDestroyed(function () {
      var inst = Template.__updateTemplateInstance(view);
      template.destroyed.call(inst);
    });
  }

  return view;
};

var _hasOwnProperty = Object.prototype.hasOwnProperty;

Template.__lookup__ = function (templateName) {
  if (! _hasOwnProperty.call(Template, templateName))
    return null;
  var tmpl = Template[templateName];
  if (Template.__isTemplate__(tmpl))
    return tmpl;
  return null;
};

Template.__create__ = function (viewName, templateFunc, initView) {
  var tmpl = new Template.prototype.constructor;
  tmpl.__viewName = viewName;
  tmpl.__render = templateFunc;
  if (initView)
    tmpl.__initView = initView;

  return tmpl;
};

Template.__define__ = function (templateName, templateFunc) {
  if (_hasOwnProperty.call(Template, templateName)) {
    if (Template[templateName].__makeView)
      throw new Error("There are multiple templates named '" + templateName + "'. Each template needs a unique name.");
    throw new Error("This template name is reserved: " + templateName);
  }

  var tmpl = Template.__create__('Template.' + templateName, templateFunc);
  tmpl.__templateName = templateName;

  Template[templateName] = tmpl;
  return tmpl;
};

Template.__isTemplate__ = function (x) {
  return x && x.__makeView;
};

// Define a template `Template.__body__` that renders its
// `__contentParts`.
Template.__define__('__body__', function () {
  var parts = Template.__body__.__contentParts;
  // enable lookup by setting `view.template`
  for (var i = 0; i < parts.length; i++)
    parts[i].template = Template.__body__;
  return parts;
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
  var range = Blaze.render(Template.__body__);
  Template.__body__.__view = range.view;
  range.attach(document.body);
};
Template.__body__.__instantiate = instantiateBody;


// Renders a template (eg `Template.foo`), returning a DOMRange. The
// range will keep updating reactively.
UI.render = function (tmpl) {
  if (! Template.__isTemplate__(tmpl))
    throw new Error("Template required here");

  return Blaze.render(tmpl);
};

// Same as `UI.render` with a data context passed in.
UI.renderWithData = function (tmpl, data) {
  if (! Template.__isTemplate__(tmpl))
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
  if (! range instanceof Blaze.DOMRange)
    throw new Error("Expected template rendered with UI.render");

  range.attach(parentElement, nextNode);
};

// XXX test and document
UI.remove = function (range) {
  if (! range instanceof Blaze.DOMRange)
    throw new Error("Expected template rendered with UI.render");

  if (range.attached)
    range.detach();
  range.destroy();
};

UI.body = Template.__body__;
