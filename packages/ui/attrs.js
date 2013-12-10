
// An AttributeHandler object is responsible for updating a particular attribute
// of a particular element.  AttributeHandler subclasses implement
// browser-specific logic for dealing with particular attributes across
// different browsers.
//
// To define a new type of AttributeHandler, use
// `var FooHandler = AttributeHandler.extend({ update: function ... })`
// where the `update` function takes arguments `(element, oldValue, value)`.
// The `element` argument is always the same between calls to `update` on
// the same instance.  `oldValue` and `value` are each either `null` or
// a Unicode string of the type that might be passed to the value argument
// of `setAttribute` (i.e. not an HTML string with character references).
// When an AttributeHandler is installed, an initial call to `update` is
// always made with `oldValue = null`.  The `update` method can access
// `this.name` if the AttributeHandler class is a generic one that applies
// to multiple attribute names.
//
// AttributeHandlers can store custom properties on `this`, as long as they
// don't use the names `element`, `name`, `value`, and `oldValue`.
//
// AttributeHandlers can't influence how attributes appear in rendered HTML,
// only how they are updated after materialization as DOM.

AttributeHandler = function (name, value) {
  this.name = name;
  this.value = value;
};

_.extend(AttributeHandler.prototype, {
  update: function (element, oldValue, value) {
    if (value === null) {
      if (oldValue !== null)
        element.removeAttribute(this.name);
    } else {
      element.setAttribute(this.name, this.value);
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
    _.extend(subType.prototype, options);
  return subType;
};

// Value of a ClassHandler is either a string or an array.
var ClassHandler = AttributeHandler.extend({
  update: function (element, oldValue, value) {
    var oldClasses = oldValue ? _.compact(oldValue.split(' ')) : [];
    var newClasses = value ? _.compact(value.split(' ')) : [];

    // the current classes on the element, which we will mutate.
    var classes = _.compact(element.className.split(' '));

    // optimize this later (to be asymptotically faster) if necessary
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

var SelectedHandler = AttributeHandler.extend({
  update: function (element, oldValue, value) {
    if (value == null) {
      if (oldValue != null)
        element.selected = false;
    } else {
      element.selected = true;
    }
  }
});

// XXX make it possible for users to register attribute handlers!
makeAttributeHandler = function (name, value) {
  // XXX will need one for 'style' on IE, though modern browsers
  // seem to handle setAttribute ok.
  if (name === 'class') {
    return new ClassHandler(name, value);
  } else if (name === 'selected') {
    return new SelectedHandler(name, value);
  } else {
    return new AttributeHandler(name, value);
  }
};
