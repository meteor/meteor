// # TODO
//
// Should be an actual helpers dict, so you can in theory name a
// helper anything.  Test that you can.
//
// Catch it when you name a template something weird, like "name,"
// given the global Template is now a function.
//
// Finish adding things to UI.  Take it out of the "templating" package.
// Merge Blaze and UI symbols?


// `Blaze.Template` is the class of templates, like `Template.foo` in
// Meteor, which is `instanceof Template`.
//
// `viewKind` is a string that looks like "Template.foo" for templates
// defined by the compiler.
Blaze.Template = function (viewKind, viewRenderFunc) {
  this.__kind = viewKind;
  this.__render = viewRenderFunc;

  this.__eventMaps = [];
};
var Template = Blaze.Template;

Blaze.isTemplate = function (t) {
  return (t instanceof Blaze.Template);
};

Template.prototype.constructView = function (contentFunc, elseFunc) {
  var self = this;
  var view = Blaze.View(self.__kind, self.__render);
  view.template = self;

  view.templateContentBlock = (
    contentFunc ? new Template('(contentBlock)', contentFunc) : null);
  view.templateElseBlock = (
    elseFunc ? new Template('(elseBlock)', elseFunc) : null);

  if (self.__eventMaps || typeof self.events === 'object') {
    view.onMaterialized(function () {
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

  if (self.created) {
    view.onCreated(function () {
      var inst = Template.updateTemplateInstance(view);
      self.created.call(inst);
    });
  }

  if (self.rendered) {
    view.onRendered(function () {
      var inst = Template.updateTemplateInstance(view);
      self.rendered.call(inst);
    });
  }

  if (self.destroyed) {
    view.onDestroyed(function () {
      var inst = Template.updateTemplateInstance(view);
      self.destroyed.call(inst);
    });
  }

  return view;
};

Template.updateTemplateInstance = function (view) {
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
      view: view
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

Template.prototype.helpers = function (dict) {
  for (var k in dict)
    this[k] = dict[k];
};

Template.prototype.events = function (eventMap) {
  var template = this;
  var eventMap2 = {};
  for (var k in eventMap) {
    eventMap2[k] = (function (k, v) {
      return function (event/*, ...*/) {
        var view = this; // passed by EventAugmenter
        var data = Blaze.getElementData(event.currentTarget);
        if (data == null)
          data = {};
        var args = Array.prototype.slice.call(arguments);
        var tmplInstance = Template.updateTemplateInstance(view);
        args.splice(1, 0, tmplInstance);
        return v.apply(data, args);
      };
    })(k, eventMap[k]);
  }

  template.__eventMaps.push(eventMap2);
};
