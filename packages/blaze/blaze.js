Blaze = {};

Blaze.HTML = HTML;

Blaze._onAutorun = function () {}; // replace this for debugging :)

// A constant empty array (frozen if the JS engine supports it).
var _emptyArray = Object.freeze ? Object.freeze([]) : [];

// Adapted from CoffeeScript's `__extends`.
var __extends = function(child, parent) {
  _.extend(child, parent);
  if (Object.create) {
    child.prototype = Object.create(parent.prototype);
  } else {
    var ctor = function () {};
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
  }
  child.prototype.constructor = child;
  child.__super__ = parent.prototype;
  return child;
};
Blaze.__extends = __extends;

// splice out one element of array that is `=== element` (if present)
var spliceOut = function (array, element) {
  for (var i = array.length - 1; i >= 0; i--) {
    if (array[i] === element) {
      array.splice(i, 1);
      break;
    }
  }
};

Blaze.Sequence = function (array) {
  if (! (this instanceof Blaze.Sequence))
    // called without new
    return new Blaze.Sequence(array);

  // clone `array`
  this.items = (array ? Array.prototype.slice.call(array) : []);
  this.observers = [];
  this.dep = new Deps.Dependency;
};

_.extend(Blaze.Sequence.prototype, {
  get: function (k) {
    var items = this.items;
    if (! (k >= 0 && k < items.length))
      throw new Error("Bad index in Blaze.Sequence#get: " + k);
    return items[k];
  },
  size: function () {
    return this.items.length;
  },
  addItem: function (item, k) {
    var self = this;
    var items = self.items;
    if (! (k >= 0 && k <= items.length))
      throw new Error("Bad index in Blaze.Sequence#addItem: " + k);

    items.splice(k, 0, item);
    this.dep.changed();

    var observers = self.observers;
    for (var i = 0; i < observers.length; i++)
      observers[i].addItem(item, k);
  },
  removeItem: function (k) {
    var self = this;
    var items = self.items;
    if (! (k >= 0 && k < items.length))
      throw new Error("Bad index in Blaze.Sequence#removeItem: " + k);

    items.splice(k, 1);
    this.dep.changed();

    var observers = self.observers;
    for (var i = 0; i < observers.length; i++)
      observers[i].removeItem(k);
  },
  observeMutations: function (callbacks) {
    var self = this;
    self.observers.push(callbacks);

    var handle = {
      stop: function () {
        spliceOut(self.observers, callbacks);
      }
    };

    if (Deps.active) {
      Deps.onInvalidate(function () {
        handle.stop();
      });
    }

    return handle;
  },
  depend: function () {
    this.dep.depend();
  }
});

// RenderPoints must support being evaluated and/or createDOMRanged multiple
// times.  They must not contain per-instance state.
Blaze.RenderPoint = function () {};

_.extend(Blaze.RenderPoint.prototype, {
  render: function () {
    return null;
  },
  // Subclasses can override evaluate, toText, toHTML, and createDOMRange
  // as they see fit.
  evaluate: function () {
    return Blaze.evaluate(this.render());
  },
  toText: function (textMode) {
    return Blaze.toText(this.evaluate(), textMode);
  },
  toHTML: function () {
    return Blaze.toHTML(this.evaluate());
  },
  createDOMRange: function () {
    return new Blaze.DOMRange(Blaze.toDOM(this.render()));
  }
});

Blaze.Isolate = function (func) {
  if (! (this instanceof Blaze.Isolate))
    // called without new
    return new Blaze.Isolate(func);

  this.func = func;
};
__extends(Blaze.Isolate, Blaze.RenderPoint);

_.extend(Blaze.Isolate.prototype, {
  render: function () {
    var func = this.func;
    return func();
  },
  createDOMRange: function () {
    return Blaze.render(this.func);
  }
});

Blaze.Controller = function () {
  this.parentController = Blaze.currentController;
};
__extends(Blaze.Controller, Blaze.RenderPoint);

_.extend(Blaze.Controller.prototype, {
  evaluate: function () {
    var self = this;
    return Blaze.withCurrentController(self, function () {
      return Blaze.evaluate(self.render());
    });
  },
  createDOMRange: function () {
    var self = this;
    var range = Blaze.withCurrentController(self, function () {
      return self.renderToDOM();
    });
    if (! range)
      debugger;
    range.controller = self;
    self.domrange = range;
    return range;
  },
  renderToDOM: function () {
    return new Blaze.DOMRange(Blaze.toDOM(this.render()));
  }
});

Blaze.currentController = null;

Blaze.withCurrentController = function (controller, func) {
  var oldController = Blaze.currentController;
  try {
    Blaze.currentController = controller;
    return func();
  } finally {
    Blaze.currentController = oldController;
  }
};

Blaze.Component = function () {
  Blaze.Controller.call(this);
};
__extends(Blaze.Component, Blaze.Controller);

_.extend(Blaze.Component.prototype, {
  renderToDOM: function () {
    var self = this;
    if (self.domrange)
      throw new Error("Can't render a Component twice!");

    var range = Blaze.render(function () {
      return self.render();
    });
    range.onstop(function () {
      self.finalize();
    });
    return range;
  },
  finalize: function () {}
});

  // ------------------------------ DOMBACKEND ------------------------------


var DOMBackend = {};

var $jq = jQuery;

DOMBackend.parseHTML = function (html) {
  // Return an array of nodes.
  //
  // jQuery does fancy stuff like creating an appropriate
  // container element and setting innerHTML on it, as well
  // as working around various IE quirks.
  return $jq.parseHTML(html) || [];
};



  //////////////////// Blaze.toText

  // Escaping modes for outputting text when generating HTML.
  Blaze.TEXTMODE = {
    ATTRIBUTE: 1,
    RCDATA: 2,
    STRING: 3
  };

var ToTextVisitor = HTML.Visitor.extend({
  visitNull: function (nullOrUndefined) {
    return '';
  },
  visitPrimitive: function (stringBooleanOrNumber) {
    return String(stringBooleanOrNumber);
  },
  visitArray: function (array) {
    var parts = [];
    for (var i = 0; i < array.length; i++)
      parts.push(this.visit(array[i]));
    return parts.join('');
  },
  visitComment: function (comment) {
    throw new Error("Can't have a comment here");
  },
  visitCharRef: function (charRef) {
    return charRef.str;
  },
  visitRaw: function (raw) {
    return raw.value;
  },
  visitTag: function (tag) {
    // Really we should just disallow Tags here.  However, at the
    // moment it's useful to stringify any HTML we find.  In
    // particular, when you include a template within `{{#markdown}}`,
    // we render the template as text, and since there's currently
    // no way to make the template be *parsed* as text (e.g. `<template
    // type="text">`), we hackishly support HTML tags in markdown
    // in templates by parsing them and stringifying them.
    return this.visit(this.toHTML(tag));
  },
  visitObject: function (x) {
    if (x instanceof Blaze.RenderPoint)
      return x.toText();

    throw new Error("Unexpected object in htmljs in toText: " + x);
  },
  toHTML: function (node) {
    return Blaze.toHTML(node);
  }
});

var ToRCDataVisitor = ToTextVisitor.extend({
  visitPrimitive: function (stringBooleanOrNumber) {
    var str = String(stringBooleanOrNumber);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  },
  visitCharRef: function (charRef) {
    return charRef.html;
  }
});

var ToAttributeTextVisitor = ToTextVisitor.extend({
  visitPrimitive: function (stringBooleanOrNumber) {
    var str = String(stringBooleanOrNumber);
    // escape `&` and `"` this time, not `&` and `<`
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  },
  visitCharRef: function (charRef) {
    return charRef.html;
  }
});

Blaze.TEXTMODE.Visitors = {};
Blaze.TEXTMODE.Visitors[Blaze.TEXTMODE.STRING] = ToTextVisitor;
Blaze.TEXTMODE.Visitors[Blaze.TEXTMODE.RCDATA] = ToRCDataVisitor;
Blaze.TEXTMODE.Visitors[Blaze.TEXTMODE.ATTRIBUTE] = ToAttributeTextVisitor;

Blaze.toText = function (content, textMode) {
  var visitor = Blaze.TEXTMODE.Visitors[textMode];
  if (! visitor) {
    if (! textMode)
      throw new Error("textMode required for Blaze.toText");
    throw new Error("Unknown textMode: " + textMode);
  }

  return (new visitor).visit(content);
};



  //////////////////// Blaze.toHTML

  // This function is mainly for server-side rendering and is not in the normal
  // code path for client-side rendering.

var ToHTMLVisitor = HTML.Visitor.extend({
  visitNull: function (nullOrUndefined) {
    return '';
  },
  visitPrimitive: function (stringBooleanOrNumber) {
    var str = String(stringBooleanOrNumber);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  },
  visitArray: function (array) {
    var parts = [];
    for (var i = 0; i < array.length; i++)
      parts.push(this.visit(array[i]));
    return parts.join('');
  },
  visitComment: function (comment) {
    return '<!--' + comment.sanitizedValue + '-->';
  },
  visitCharRef: function (charRef) {
    return charRef.html;
  },
  visitRaw: function (raw) {
    return raw.value;
  },
  visitTag: function (tag) {
    var attrStrs = [];

    var attrs = tag.attrs;
    if (attrs) {
      for (var k in attrs) {
        var v = this.toText(attrs[k], Blaze.TEXTMODE.ATTRIBUTE);
        attrStrs.push(' ' + k + '="' + v + '"');
      }
    }

    var tagName = tag.tagName;
    var startTag = '<' + tagName + attrStrs.join('') + '>';

    var children = tag.children;
    var childStrs = [];
    var content;
    if (tagName === 'textarea') {

      for (var i = 0; i < children.length; i++)
        childStrs.push(this.toText(children[i], Blaze.TEXTMODE.RCDATA));

      content = childStrs.join('');
      if (content.slice(0, 1) === '\n')
        // TEXTAREA will absorb a newline, so if we see one, add
        // another one.
        content = '\n' + content;

    } else {
      for (var i = 0; i < children.length; i++)
        childStrs.push(this.visit(children[i]));

      content = childStrs.join('');
    }

    var result = startTag + content;

    if (children.length || ! HTML.isVoidElement(tagName)) {
      // "Void" elements like BR are the only ones that don't get a close
      // tag in HTML5.  They shouldn't have contents, either, so we could
      // throw an error upon seeing contents here.
      result += '</' + tagName + '>';
    }

    return result;
  },
  visitObject: function (x) {
    if (x instanceof Blaze.RenderPoint)
      return x.toHTML();

    throw new Error("Unexpected object in htmljs in toHTML: " + x);
  },
  toText: function (node, textMode) {
    return Blaze.toText(node, textMode);
  }
});

Blaze.toHTML = function (content) {
  return (new ToHTMLVisitor).visit(content);
};


//////////////////// evaluate

var IDENT = function (x) { return x; };

var EvaluatingVisitor = HTML.TransformingVisitor.extend({
  visitObject: function (x) {
    if (x instanceof Blaze.RenderPoint)
      return x.evaluate();

    // this will throw an error; other objects are not allowed!
    return HTML.TransformingVisitor.prototype.visitObject.call(this, x);
  },
  visitAttributes: function (attrs) {
    if (attrs instanceof Blaze.Var)
      attrs = attrs.get();

    // call super
    return HTML.TransformingVisitor.prototype.visitAttributes.call(this, attrs);
  }
});

// Expand all Vars and components, making the current computation depend on them.
Blaze.evaluate = function (content) {
  return (new EvaluatingVisitor).visit(content);
};

Blaze._evaluateAttributes = function (attrs) {
  return (new EvaluatingVisitor).visitAttributes(attrs);
};

  //////////////////// Blaze.toDOM

var ToDOMVisitor = HTML.Visitor.extend({
  visitNull: function (x, intoArray) {
    return intoArray;
  },
  visitPrimitive: function (primitive, intoArray) {
    var string = String(primitive);
    intoArray.push(document.createTextNode(string));
    return intoArray;
  },
  visitArray: function (array, intoArray) {
    for (var i = 0; i < array.length; i++)
      this.visit(array[i], intoArray);
    return intoArray;
  },
  visitComment: function (comment, intoArray) {
    intoArray.push(document.createComment(comment.sanitizedValue));
    return intoArray;
  },
  visitRaw: function (raw, intoArray) {
    // Get an array of DOM nodes by using the browser's HTML parser
    // (like innerHTML).
    var nodes = DOMBackend.parseHTML(raw.value);
    for (var i = 0; i < nodes.length; i++)
      intoArray.push(nodes[i]);

    return intoArray;
  },
  visitTag: function (tag, intoArray) {
    var tagName = tag.tagName;
    var elem;
    if (HTML.isKnownSVGElement(tagName) && document.createElementNS) {
      // inline SVG
      elem = document.createElementNS('http://www.w3.org/2000/svg', tagName);
    } else {
      // normal elements
      elem = document.createElement(tagName);
    }

    var rawAttrs = tag.attrs;
    var children = tag.children;
    if (tagName === 'textarea') {
      // turn TEXTAREA contents into a value attribute
      rawAttrs = (rawAttrs || {});
      rawAttrs.value = children;
      children = [];
    }

    if (rawAttrs) {
      var attrUpdater = new ElementAttributesUpdater(elem);
      var controller = Blaze.currentController;
      Blaze._onAutorun(Deps.autorun(function (c) {
        Blaze.withCurrentController(controller, function () {
          var evaledAttrs = Blaze._evaluateAttributes(rawAttrs);
          var flattenedAttrs = HTML.flattenAttributes(evaledAttrs);
          var stringAttrs = {};
          for (var attrName in flattenedAttrs) {
            stringAttrs[attrName] = Blaze.toText(flattenedAttrs[attrName],
                                                 Blaze.TEXTMODE.STRING);
          }
          attrUpdater.update(stringAttrs);
        });
      }));
    }

    var childNodesAndRanges = this.visit(children, []);
    for (var i = 0; i < childNodesAndRanges.length; i++) {
      var x = childNodesAndRanges[i];
      if (x instanceof Blaze.DOMRange)
        x.attach(elem);
      else
        elem.appendChild(x);
    }

    intoArray.push(elem);

    return intoArray;
  },
  visitObject: function (x, intoArray) {
    if (x instanceof Blaze.RenderPoint) {
      intoArray.push(x.createDOMRange());
      return intoArray;
    }

    // throw the default error
    return HTML.Visitor.prototype.visitObject.call(this, x);
  }
});

  Blaze.toDOM = function (content) {
    return (new ToDOMVisitor).visit(content, []);
  };

// generic stopped method for a range with a single computation attached to it
var _onstopForRender = function () {
  this.computation.stop();
};

Blaze.render = function (func) {
  var range = new Blaze.DOMRange;
  var controller = Blaze.currentController;
  range.computation = Deps.autorun(function () {
    Blaze.withCurrentController(controller, function () {
      var content = func();
      range.setMembers(Blaze.toDOM(content));
    });
  });
  Blaze._onAutorun(range.computation);
  range.onstop(_onstopForRender);
  // XXX figure how the autorun gets stopped
  // (like a Blaze.finalize call)
  return range;
};

Blaze.renderList = function (funcSequence) {
  if (! (funcSequence instanceof Blaze.Sequence))
    throw new Error("Expected a Blaze.Sequence of functions in " +
                    "Blaze.renderList");

  var initialMembers;
  var computation = Deps.autorun(function (c) {
    if (! c.firstRun)
      return; // can't get here

    var initialCount = funcSequence.size();
    initialMembers = new Array(initialCount);
    for (var i = 0; i < initialCount; i++) {
      var func = funcSequence.get(i);
      if (typeof func !== 'function')
        throw new Error("Expected a Blaze.Sequence of functions in " +
                        "Blaze.renderList");
      initialMembers[i] = Blaze.render(func);
    }
  });
  Blaze._onAutorun(computation);

  var range = new Blaze.DOMRange(initialMembers);
  range.computation = computation;
  range.onstop(_onstopForRender);

  funcSequence.observeMutations({
    addItem: function (func, k) {
      if (typeof func !== 'function')
        throw new Error("Expected function in Blaze.renderList");
      Deps.nonreactive(function () {
        var newMember = Blaze.render(func);
        range.computation.onInvalidate(function () {
          newMember.stop();
        });
        range.addMember(newMember, k);
      });
    },
    removeItem: function (k) {
      Deps.nonreactive(function () {
        range.getMember(k).stop();
        range.removeMember(k);
      });
    }
  });

  return range;
};

//////////////////////////////////////////////////

// `[new] Blaze.DOMRange([nodeAndRangeArray])`
//
// A DOMRange consists of an array of consecutive nodes and DOMRanges,
// which may be replaced at any time with a new array.  If the DOMRange
// has been attached to the DOM at some location, then updating
// the array will cause the DOM to be updated at that location.
Blaze.DOMRange = function (nodeAndRangeArray) {
  if (! (this instanceof Blaze.DOMRange))
    // called without `new`
    return new Blaze.DOMRange(nodeAndRangeArray);

  var members = (nodeAndRangeArray || _emptyArray);
  if (! (members && (typeof members.length) === 'number'))
    throw new Error("Expected array");

  for (var i = 0; i < members.length; i++)
    this._memberIn(members[i]);

  this.members = members;
  this.placeholderComment = null;
  this.attached = false;
  this.parentElement = null;
  this.parentRange = null;
  this.stopCallbacks = _emptyArray;
};

// static methods
_.extend(Blaze.DOMRange, {
  attach: function (rangeOrNode, parentElement, nextNode) {
    var m = rangeOrNode;
    if (m instanceof Blaze.DOMRange) {
      m.attach(parentElement, nextNode);
    } else {
      parentElement.insertBefore(m, nextNode || null);
    }
  },
  detach: function (rangeOrNode) {
    var m = rangeOrNode;
    if (m instanceof Blaze.DOMRange) {
      m.detach();
    } else {
      m.parentNode.removeChild(m);
    }
  },
  firstNode: function (rangeOrNode) {
    var m = rangeOrNode;
    return (m instanceof Blaze.DOMRange) ? m.firstNode() : m;
  },
  lastNode: function (rangeOrNode) {
    var m = rangeOrNode;
    return (m instanceof Blaze.DOMRange) ? m.lastNode() : m;
  }
});


_.extend(Blaze.DOMRange.prototype, {
  _memberIn: function (m) {
    if (m instanceof Blaze.DOMRange)
      m.parentRange = this;
    else if (m.nodeType === 1) // DOM Element
      m.$blaze_range = this;
  },
  _memberOut: function (m) {
    // old members are almost always GCed immediately.
    // to avoid the potentialy performance hit of deleting
    // a property, we simple null it out.
    if (m instanceof Blaze.DOMRange)
      m.parentRange = null;
    else if (m.nodeType === 1) // DOM Element
      m.$blaze_range = null;
  },
  attach: function (parentElement, nextNode) {
    // This method is called to insert the DOMRange into the DOM for
    // the first time, but it's also used internally when
    // updating the DOM.
    var members = this.members;
    if (members.length) {
      this.placeholderComment = null;
      for (var i = 0; i < members.length; i++) {
        Blaze.DOMRange.attach(members[i], parentElement, nextNode);
      }
    } else {
      var comment = document.createComment("empty");
      this.placeholderComment = comment;
      parentElement.insertBefore(comment, nextNode || null);
    }
    this.attached = true;
    this.parentElement = parentElement;
  },
  setMembers: function (newNodeAndRangeArray) {
    var newMembers = newNodeAndRangeArray;
    if (! (newMembers && (typeof newMembers.length) === 'number'))
      throw new Error("Expected array");

    var oldMembers = this.members;


    for (var i = 0; i < oldMembers.length; i++)
      this._memberOut(oldMembers[i]);
    for (var i = 0; i < newMembers.length; i++)
      this._memberIn(newMembers[i]);

    if (! this.attached) {
      this.members = newMembers;
    } else {
      // don't do anything if we're going from empty to empty
      if (newMembers.length || oldMembers.length) {
        // detach the old members and insert the new members
        var nextNode = this.lastNode().nextSibling;
        var parentElement = this.parentElement;
        this.detach();
        this.members = newMembers;
        this.attach(parentElement, nextNode);
      }
    }
  },
  firstNode: function () {
    if (! this.attached)
      throw new Error("Must be attached");

    if (! this.members.length)
      return this.placeholderComment;

    var m = this.members[0];
    return (m instanceof Blaze.DOMRange) ? m.firstNode() : m;
  },
  lastNode: function () {
    if (! this.attached)
      throw new Error("Must be attached");

    if (! this.members.length)
      return this.placeholderComment;

    var m = this.members[this.members.length - 1];
    return (m instanceof Blaze.DOMRange) ? m.lastNode() : m;
  },
  detach: function () {
    var members = this.members;
    if (members.length) {
      for (var i = 0; i < members.length; i++) {
        Blaze.DOMRange.detach(members[i]);
      }
    } else {
      var comment = this.placeholderComment;
      this.parentElement.removeChild(comment);
      this.placeholderComment = null;
    }
    this.attached = false;
    this.parentElement = null;
  },
  addMember: function (newMember, atIndex) {
    var members = this.members;
    if (! (atIndex >= 0 && atIndex <= members.length))
      throw new Error("Bad index in range.addMember: " + atIndex);

    this._memberIn(newMember);

    if (! this.attached) {
      // currently detached; just updated members
      members.splice(atIndex, 0, newMember);
    } else if (members.length === 0) {
      // empty; use the empty-to-nonempty handling of setMembers
      this.setMembers([newMember]);
    } else {
      var nextNode;
      if (atIndex === members.length) {
        // insert at end
        nextNode = this.lastNode().nextSibling;
      } else {
        nextNode = Blaze.DOMRange.firstNode(members[atIndex]);
      }
      members.splice(atIndex, 0, newMember);
      Blaze.DOMRange.attach(newMember, this.parentElement, nextNode);
    }
  },
  removeMember: function (atIndex) {
    var members = this.members;
    if (! (atIndex >= 0 && atIndex < members.length))
      throw new Error("Bad index in range.removeMember: " + atIndex);

    var oldMember = members[atIndex];
    this._memberOut(oldMember);

    if (members.length === 1) {
      // becoming empty; use the logic in setMembers
      this.setMembers(_emptyArray);
    } else {
      members.splice(atIndex, 1);
      if (this.attached)
        Blaze.DOMRange.detach(oldMember);
    }
  },
  getMember: function (atIndex) {
    var members = this.members;
    if (! (atIndex >= 0 && atIndex < members.length))
      throw new Error("Bad index in range.getMember: " + atIndex);
    return this.members[atIndex];
  },
  stop: function () {
    var stopCallbacks = this.stopCallbacks;
    for (var i = 0; i < stopCallbacks.length; i++)
      stopCallbacks[i].call(this);
    this.stopCallbacks = _emptyArray;
  },
  onstop: function (cb) {
    if (this.stopCallbacks === _emptyArray)
      this.stopCallbacks = [];
    this.stopCallbacks.push(cb);
  }
});

// `[new] Blaze.Var(initializer[, equalsFunc])`
//
// A Var is a reactive mutable variable which may be initialized with a
// value or a with a reactive function.  If the initializer is a reactive
// function, a Deps Computation is kicked off from the constructor
// that updates the reactive variable.
Blaze.Var = function (initializer, equalsFunc) {
  var self = this;

  if (! (self instanceof Blaze.Var))
    // called without `new`
    return new Blaze.Var(initializer, equalsFunc);

  self.equalsFunc = equalsFunc;
  self.curValue = null;
  self.inited = false;
  self.dep = new Deps.Dependency;
  self.computation = null;

  if (typeof initializer === 'function') {
    if (! Deps.active)
      throw new Error("Can only create a Blaze.Var(function...) inside a Computation");

    var controller = Blaze.currentController;
    self.computation = Deps.autorun(function (c) {
      Blaze.withCurrentController(controller, function () {
        self.set(initializer());
      });
    });
    Blaze._onAutorun(self.computation);
  } else {
    self.set(initializer);
  }
  self.inited = true;
};

_.extend(Blaze.Var.prototype, {
  get: function () {
    if (Deps.active)
      this.dep.depend();

    return this.curValue;
  },
  set: function (newValue) {
    var equals = this.equalsFunc;
    var oldValue = this.curValue;

    if (this.inited &&
        (equals ? equals(newValue, oldValue) :
         newValue === oldValue)) {
      // value is same as last time
      return;
    }

    this.curValue = newValue;
    this.dep.changed();
  },
  toString: function () {
    return 'Var{' + this.get() + '}';
  }
});

Blaze.List = function (funcSequence) {
  var self = this;

  if (! (self instanceof Blaze.List))
    // called without `new`
    return new Blaze.List(funcSequence);

  if (! (funcSequence instanceof Blaze.Sequence))
    throw new Error("Expected a Blaze.Sequence of functions in Blaze.List");

  self.funcSeq = funcSequence;
};
__extends(Blaze.List, Blaze.RenderPoint);

_.extend(Blaze.List.prototype, {
  render: function () {
    var funcSeq = this.funcSeq;
    this.funcSeq.depend();

    var size = funcSeq.size();
    var result = new Array(size);
    for (var i = 0; i < size; i++) {
      var f = funcSeq.get(i);
      result[i] = f();
    }
    return result;
  },
  createDOMRange: function () {
    return Blaze.renderList(this.funcSeq);
  }
});


////////////////////////////// TESTING CODE
