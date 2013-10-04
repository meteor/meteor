
var ATTRIBUTE_NAME_REGEX = /^[^\s"'>/=]+$/;

var isValidAttributeName = function (str) {
  return ATTRIBUTE_NAME_REGEX.test(str);
};

UI.isValidAttributeName = isValidAttributeName;

AttributeManager = function (dictOrFunc) {
  var self = this;

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
    if (! attrName)
      continue; // ignore empty attribute names
    // perform a sanity check, since we'll be inserting
    // attrName directly into the HTML stream
    if (! isValidAttributeName(attrName))
      throw new Error("Expected single HTML attribute name, found: '" + attrName + "'");

    handlers[attrName] = makeAttributeHandler(
      attrName, dict[attrName]);
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

    var element = self.element;
    var handlers = self.handlers;

    // XXX make this be stopped at the right time
    Deps.autorun(function (c) {

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
        if (! k)
          continue; // ignore empty attributes
        if (! handlers.hasOwnProperty(k)) {
          // need a new handler
          var attrName = k;

          if (! isValidAttributeName(attrName))
            throw new Error("Expected single HTML attribute name, found: " + attrName);

          var h = makeAttributeHandler(
            attrName, newDict[attrName]);

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

var ClassHandler = AttributeHandler.extend({
  stringifyValue: function (value) {
    if (typeof value === 'string')
      return value;
    else if (typeof value.length === 'number') {
      return Array.prototype.join.call(value, ' ');
    } else {
      return String(value);
    }
  },
  update: function (element, oldValue, value) {
    var oldClasses = oldValue;
    if (typeof oldClasses === 'string')
      oldClasses = _.compact(oldClasses.split(' '));
    var newClasses = value;
    if (typeof newClasses === 'string')
      newClasses = _.compact(newClasses.split(' '));

    var classes = _.compact(element.className.split(' '));

    // XXX optimize this later
    _.each(oldClasses, function (c) {
      if (_.indexOf(newClasses, c) < 0)
        classes = _.without(classes, c);
    });
    _.each(newClasses, function (c) {
      if (_.indexOf(oldClasses, c) < 0 &&
          _.indexOf(classes, c) < 0)
        classes.push(c);
    });

    element.className = classes.join(' ');
  }
});

var makeAttributeHandler = function (name, value) {
  // XXX will need one for 'style' on IE, though modern browsers
  // seem to handle setAttribute ok.
  // XXX components should be able to hook into this
  if (name === 'class') {
    return new ClassHandler(name, value);
  } else {
    return new AttributeHandler(name, value);
  }
};
