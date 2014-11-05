// [new] Blaze.Template([viewName], renderFunction)
//
// `Blaze.Template` is the class of templates, like `Template.foo` in
// Meteor, which is `instanceof Template`.
//
// `viewKind` is a string that looks like "Template.foo" for templates
// defined by the compiler.

/**
 * @class
 * @summary Constructor for a Template, which is used to construct Views with particular name and content.
 * @locus Client
 * @param {String} [viewName] Optional.  A name for Views constructed by this Template.  See [`view.name`](#view_name).
 * @param {Function} renderFunction A function that returns [*renderable content*](#renderable_content).  This function is used as the `renderFunction` for Views constructed by this Template.
 */
Blaze.Template = function (viewName, renderFunction) {
  if (! (this instanceof Blaze.Template))
    // called without `new`
    return new Blaze.Template(viewName, renderFunction);

  if (typeof viewName === 'function') {
    // omitted "viewName" argument
    renderFunction = viewName;
    viewName = '';
  }
  if (typeof viewName !== 'string')
    throw new Error("viewName must be a String (or omitted)");
  if (typeof renderFunction !== 'function')
    throw new Error("renderFunction must be a function");

  this.viewName = viewName;
  this.renderFunction = renderFunction;

  this.__helpers = new HelperMap;
  this.__eventMaps = [];
};
var Template = Blaze.Template;

var HelperMap = function () {};
HelperMap.prototype.get = function (name) {
  return this[' '+name];
};
HelperMap.prototype.set = function (name, helper) {
  this[' '+name] = helper;
};
HelperMap.prototype.has = function (name) {
  return (' '+name) in this;
};

/**
 * @summary Returns true if `value` is a template object like `Template.myTemplate`.
 * @locus Client
 * @param {Any} value The value to test.
 */
Blaze.isTemplate = function (t) {
  return (t instanceof Blaze.Template);
};

Template.prototype.constructView = function (contentFunc, elseFunc) {
  var self = this;
  var view = Blaze.View(self.viewName, self.renderFunction);
  view.template = self;

  view.templateContentBlock = (
    contentFunc ? new Template('(contentBlock)', contentFunc) : null);
  view.templateElseBlock = (
    elseFunc ? new Template('(elseBlock)', elseFunc) : null);

  if (self.__eventMaps || typeof self.events === 'object') {
    view._onViewRendered(function () {
      if (view.renderCount !== 1)
        return;

      if (! self.__eventMaps.length && typeof self.events === "object") {
        // Provide limited back-compat support for `.events = {...}`
        // syntax.  Pass `template.events` to the original `.events(...)`
        // function.  This code must run only once per template, in
        // order to not bind the handlers more than once, which is
        // ensured by the fact that we only do this when `__eventMaps`
        // is falsy, and we cause it to be set now.
        Template.prototype.events.call(self, self.events);
      }

      _.each(self.__eventMaps, function (m) {
        Blaze._addEventMap(view, m, view);
      });
    });
  }

  view._templateInstance = new Blaze.TemplateInstance(view);
  view.templateInstance = function () {
    // Update data, firstNode, and lastNode, and return the TemplateInstance
    // object.
    var inst = view._templateInstance;

    /**
     * @instance
     * @memberOf Blaze.TemplateInstance
     * @name  data
     * @summary The data context of this instance's latest invocation.
     * @locus Client
     */
    inst.data = Blaze.getData(view);

    if (view._domrange && !view.isDestroyed) {
      inst.firstNode = view._domrange.firstNode();
      inst.lastNode = view._domrange.lastNode();
    } else {
      // on 'created' or 'destroyed' callbacks we don't have a DomRange
      inst.firstNode = null;
      inst.lastNode = null;
    }

    return inst;
  };

  /**
   * @name  created
   * @instance
   * @memberOf Template
   * @summary Provide a callback when an instance of a template is created.
   * @locus Client
   */
  if (self.created) {
    view.onViewCreated(function () {
      self.created.call(view.templateInstance());
    });
  }

  /**
   * @name  rendered
   * @instance
   * @memberOf Template
   * @summary Provide a callback when an instance of a template is rendered.
   * @locus Client
   */
  if (self.rendered) {
    view.onViewReady(function () {
      self.rendered.call(view.templateInstance());
    });
  }

  /**
   * @name  destroyed
   * @instance
   * @memberOf Template
   * @summary Provide a callback when an instance of a template is destroyed.
   * @locus Client
   */
  if (self.destroyed) {
    view.onViewDestroyed(function () {
      self.destroyed.call(view.templateInstance());
    });
  }

  return view;
};

/**
 * @class
 * @summary The class for template instances
 * @param {Blaze.View} view
 * @instanceName template
 */
Blaze.TemplateInstance = function (view) {
  if (! (this instanceof Blaze.TemplateInstance))
    // called without `new`
    return new Blaze.TemplateInstance(view);

  if (! (view instanceof Blaze.View))
    throw new Error("View required");

  view._templateInstance = this;

  /**
   * @name view
   * @memberOf Blaze.TemplateInstance
   * @instance
   * @summary The [View](#blaze_view) object for this invocation of the template.
   * @locus Client
   * @type {Blaze.View}
   */
  this.view = view;
  this.data = null;

  /**
   * @name firstNode
   * @memberOf Blaze.TemplateInstance
   * @instance
   * @summary The first top-level DOM node in this template instance.
   * @locus Client
   * @type {DOMNode}
   */
  this.firstNode = null;

  /**
   * @name lastNode
   * @memberOf Blaze.TemplateInstance
   * @instance
   * @summary The last top-level DOM node in this template instance.
   * @locus Client
   * @type {DOMNode}
   */
  this.lastNode = null;
};

/**
 * @summary Find all elements matching `selector` in this template instance, and return them as a JQuery object.
 * @locus Client
 * @param {String} selector The CSS selector to match, scoped to the template contents.
 * @returns {DOMNode[]}
 */
Blaze.TemplateInstance.prototype.$ = function (selector) {
  var view = this.view;
  if (! view._domrange)
    throw new Error("Can't use $ on template instance with no DOM");
  return view._domrange.$(selector);
};

/**
 * @summary Find all elements matching `selector` in this template instance.
 * @locus Client
 * @param {String} selector The CSS selector to match, scoped to the template contents.
 * @returns {DOMElement[]}
 */
Blaze.TemplateInstance.prototype.findAll = function (selector) {
  return Array.prototype.slice.call(this.$(selector));
};

/**
 * @summary Find one element matching `selector` in this template instance.
 * @locus Client
 * @param {String} selector The CSS selector to match, scoped to the template contents.
 * @returns {DOMElement}
 */
Blaze.TemplateInstance.prototype.find = function (selector) {
  var result = this.$(selector);
  return result[0] || null;
};

/**
 * @summary A version of [Tracker.autorun](#tracker_autorun) that is stopped when the template is destroyed.
 * @locus Client
 * @param {Function} runFunc The function to run. It receives one argument: a Tracker.Computation object.
 */
Blaze.TemplateInstance.prototype.autorun = function (f) {
  return this.view.autorun(f);
};

/**
 * @summary Specify template helpers available to this template.
 * @locus Client
 * @param {Object} helpers Dictionary of helper functions by name.
 */
Template.prototype.helpers = function (dict) {
  for (var k in dict)
    this.__helpers.set(k, dict[k]);
};

/**
 * @summary Specify event handlers for this template.
 * @locus Client
 * @param {EventMap} eventMap Event handlers to associate with this template.
 */
Template.prototype.events = function (eventMap) {
  var template = this;
  var eventMap2 = {};
  for (var k in eventMap) {
    eventMap2[k] = (function (k, v) {
      return function (event/*, ...*/) {
        var view = this; // passed by EventAugmenter
        var data = Blaze.getData(event.currentTarget);
        if (data == null)
          data = {};
        var args = Array.prototype.slice.call(arguments);
        var tmplInstance = view.templateInstance();
        args.splice(1, 0, tmplInstance);
        return v.apply(data, args);
      };
    })(k, eventMap[k]);
  }

  template.__eventMaps.push(eventMap2);
};

/**
 * @function
 * @name instance
 * @memberOf Template
 * @summary The [template instance](#template_inst) corresponding to the current template helper, event handler, callback, or autorun.  If there isn't one, `null`.
 * @locus Client
 * @returns Blaze.TemplateInstance
 */
Template.instance = function () {
  var view = Blaze.currentView;

  while (view && ! view.template)
    view = view.parentView;

  if (! view)
    return null;

  return view.templateInstance();
};

// Note: Template.currentData() is documented to take zero arguments,
// while Blaze.getData takes up to one.

/**
 * @summary Returns the data context of the current helper, or the data context of the template that declares the current event handler or callback.  Establishes a reactive dependency on the result.
 * @locus Client
 * @function
 */
Template.currentData = Blaze.getData;

/**
 * @summary Accesses other data contexts that enclose the current data context.
 * @locus Client
 * @function
 * @param {Integer} numLevels The number of levels beyond the current data context to look.
 */
Template.parentData = Blaze._parentData;

/**
 * @summary Defines a [helper function](#template_helpers) which can be used from all templates.
 * @locus Client
 * @function
 * @param {String} name The name of the helper function you are defining.
 * @param {Function} function The helper function itself.
 */
Template.registerHelper = Blaze.registerHelper;
