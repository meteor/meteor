
var ATTRIBUTE_NAME_REGEX = /^[^\s"'>/=/]+$/;

var isValidAttributeName = function (str) {
  return ATTRIBUTE_NAME_REGEX.test(str);
};

var makeAttributeHandler = function (component, name, value) {
  return new (component.constructor._attributeHandlers[name] ||
               AttributeHandler)(name, value);
};

AttributeManager = function (component, dictOrFunc) {
  var self = this;
  self.component = component;

  var dict, func;

  if (typeof dictOrFunc === 'function') {
    func = dictOrFunc;
    // Calculate the initial value without capturing any
    // dependencies.  Once the element exists, we'll recalculate
    // it in an autorun.  This makes the overall logic simpler.
    Deps.nonreactive(function () {
      dict = func();
    });
  } else {
    // non-reactive attrs
    func = null;
    dict = dictOrFunc;
  }

  if ((! dict) || (typeof dict !== 'object'))
    throw new Error("Expected object containing attribute names/values");

  self.func = func;
  self.handlers = {};

  var handlers = self.handlers;
  for (var attrName in dict) {
    // perform a sanity check, since we'll be inserting
    // attrName directly into the HTML stream
    if (! isValidAttributeName(attrName))
      throw new Error("Illegal HTML attribute name: " + attrName);

    handlers[attrName] = makeAttributeHandler(
      component, attrName, dict[attrName]);
  }
};

_extend(AttributeManager.prototype, {
  element: null,
  isReactive: function () {
    return !! this.func;
  },
  wire: function (n) {
    this.element = n;
  },
  getInitialHTML: function () {
    var self = this;
    var handlers = self.handlers;

    var strs = [];
    for (var attrName in handlers)
      strs.push(handlers[attrName].getHTML());

    return strs.join(' ');
  },
  start: function () {
    var self = this;
    if (! self.isReactive())
      throw new Error("Can't start a non-reactive AttributeManager");

    var component = self.component;
    var element = self.element;
    var handlers = self.handlers;

    component.autorun(function (c) {
      if (component.stage !== Component.BUILT ||
          ! component.containsElement(element)) {
        c.stop();
        return;
      }

      // capture dependencies of this line:
      var newDict = self.func();

      // update all handlers.
      //
      // don't GC handlers for properties that
      // go away (which would be necessary if someone really attaches
      // O(N) different attributes to an element over time).
      for (var k in handlers) {
        var h = handlers[k];
        var oldValue = h.value;
        h.value = newDict.hasOwnProperty(k) ? newDict[k] : null;
        h.update(element, oldValue, h.value);
      }
      for (var k in newDict) {
        if (! handlers.hasOwnProperty(k)) {
          // need a new handler
          var attrName = k;

          if (! isValidAttributeName(attrName))
            throw new Error("Illegal HTML attribute name: " + attrName);

          var h = makeAttributeHandler(
            component, attrName, newDict[attrName]);

          handlers[attrName] = h;
          h.add(element);
        }
      }
    });
  }
});

AttributeHandler = function (name, value) {
  this.name = name;
  this.value = value;
};

_extend(AttributeHandler.prototype, {
  getHTML: function () {
    var value = this.value;
    if (value == null)
      return '';

    return this.name + '="' +
      UI.encodeSpecialEntities(this.stringifyValue(value), true) + '"';
  },
  stringifyValue: function (value) {
    return String(value);
  },
  add: function (element) {
    this.update(element, null, this.value);
  },
  update: function (element, oldValue, value) {
    if (value == null) {
      if (oldValue != null)
        element.removeAttribute(this.name);
    } else {
      element.setAttribute(this.name, this.stringifyValue(value));
    }
  }
});

// @export AttributeHandler
AttributeHandler.extend = function (options) {
  var curType = this;
  var subType = function AttributeHandlerSubtype(/*arguments*/) {
    AttributeHandler.apply(this, arguments);
  };
  subType.prototype = new curType;
  subType.extend = curType.extend;
  if (options)
    _extend(subType.prototype, options);
  return subType;
};