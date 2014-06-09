
// A constant empty array (frozen if the JS engine supports it).
var _emptyArray = Object.freeze ? Object.freeze([]) : [];

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
  this.emptyRangePlaceholder = null;
  this.attached = false;
  this.parentElement = null;
  this.parentRange = null;
  this.stopCallbacks = _emptyArray;
  this.augmenters = _emptyArray;
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
  },
  forElement: function (elem) {
    if (elem.nodeType !== 1)
      throw new Error("Expected element, found: " + elem);
    var range = null;
    while (elem && ! range) {
      range = (elem.$blaze_range || null);
      if (! range)
        elem = elem.parentNode;
    }
    return range;
  }
});


_.extend(Blaze.DOMRange.prototype, {
  attach: function (parentElement, nextNode) {
    // This method is called to insert the DOMRange into the DOM for
    // the first time, but it's also used internally when
    // updating the DOM.
    var members = this.members;
    if (members.length) {
      this.emptyRangePlaceholder = null;
      for (var i = 0; i < members.length; i++) {
        Blaze.DOMRange.attach(members[i], parentElement, nextNode);
      }
    } else {
      var placeholder = document.createTextNode("");
      this.emptyRangePlaceholder = placeholder;
      parentElement.insertBefore(placeholder, nextNode || null);
    }
    this.attached = true;
    this.parentElement = parentElement;

    for(var i = 0; i < this.augmenters.length; i++)
      this.augmenters[i].attach(this, parentElement);
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
      return this.emptyRangePlaceholder;

    var m = this.members[0];
    return (m instanceof Blaze.DOMRange) ? m.firstNode() : m;
  },
  lastNode: function () {
    if (! this.attached)
      throw new Error("Must be attached");

    if (! this.members.length)
      return this.emptyRangePlaceholder;

    var m = this.members[this.members.length - 1];
    return (m instanceof Blaze.DOMRange) ? m.lastNode() : m;
  },
  detach: function () {
    if (! this.attached)
      throw new Error("Must be attached");

    var oldParentElement = this.parentElement;
    var members = this.members;
    if (members.length) {
      for (var i = 0; i < members.length; i++) {
        Blaze.DOMRange.detach(members[i]);
      }
    } else {
      var placeholder = this.emptyRangePlaceholder;
      this.parentElement.removeChild(placeholder);
      this.emptyRangePlaceholder = null;
    }
    this.attached = false;
    this.parentElement = null;

    for(var i = 0; i < this.augmenters.length; i++)
      this.augmenters[i].detach(this, oldParentElement);
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
  },
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
  containsElement: function (elem) {
    if (! this.attached)
      throw new Error("Must be attached");

    // An element is contained in this DOMRange if it's possible to
    // reach it by walking parent pointers, first through the DOM and
    // then parentRange pointers.  In other words, the element or some
    // ancestor of it is at our level of the DOM (a child of our
    // parentElement), and this element is one of our members or
    // is a member of a descendant Range.

    if (! Blaze._elementContains(this.parentElement, elem))
      return false;

    while (elem.parentNode !== this.parentElement)
      elem = elem.parentElement;

    var range = elem.$blaze_range;
    while (range && range !== this)
      range = range.parentRange;

    return range === this;
  },
  containsRange: function (range) {
    if (! this.attached)
      throw new Error("Must be attached");

    if (! range.attached)
      return false;

    // A DOMRange is contained in this DOMRange if it's possible
    // to reach this range by following parent pointers.  If the
    // DOMRange has the same parentElement, then it should be
    // a member, or a member of a member etc.  Otherwise, we must
    // contain its parentElement.

    if (range.parentElement !== this.parentElement)
      return this.containsElement(range.parentElement);

    if (range === this)
      return false; // don't contain self

    while (range && range !== this)
      range = range.parentRange;

    return range === this;
  },
  addDOMAugmenter: function (augmenter) {
    if (this.augmenters === _emptyArray)
      this.augmenters = [];
    this.augmenters.push(augmenter);
  }
});

Blaze.DOMAugmenter = JSClass.create({
  attach: function (range, element) {},
  // arguments are same as were passed to `attach`
  detach: function (range, element) {}
});

Blaze.EventAugmenter = Blaze.DOMAugmenter.extend({
  constructor: function (eventMap) {
    this.eventMap = eventMap;
    this.handles = [];
  },
  attach: function (range, element) {
    var self = this;
    var eventMap = self.eventMap;
    var handles = self.handles;

    _.each(eventMap, function (handler, spec) {
      var clauses = spec.split(/,\s+/);
      // iterate over clauses of spec, e.g. ['click .foo', 'click .bar']
      _.each(clauses, function (clause) {
        var parts = clause.split(/\s+/);
        if (parts.length === 0)
          return;

        var newEvents = parts.shift();
        var selector = parts.join(' ');
        handles.push(Blaze.EventSupport.listen(
          element, newEvents, selector,
          function (evt) {
            if (! range.containsElement(evt.currentTarget))
              return;
            return handler.apply(this, arguments);
          },
          range, function (r) {
            return r.parentRange;
          }));
      });
    });
  },
  detach: function () {
    _.each(this.handles, function (h) {
      h.stop();
    });
    this.handles.length = 0;
  }
});


// Returns true if element a contains node b and is not node b.
//
// The restriction that `a` be an element (not a document fragment,
// say) is based on what's easy to implement cross-browser.
Blaze._elementContains = function (a, b) {
  if (a.nodeType !== 1) // ELEMENT
    return false;
  if (a === b)
    return false;

  if (a.compareDocumentPosition) {
    return a.compareDocumentPosition(b) & 0x10;
  } else {
    // Should be only old IE and maybe other old browsers here.
    // Modern Safari has both functions but seems to get contains() wrong.
    // IE can't handle b being a text node.  We work around this
    // by doing a direct parent test now.
    b = b.parentNode;
    if (! (b && b.nodeType === 1)) // ELEMENT
      return false;
    if (a === b)
      return true;

    return a.contains(b);
  }
};
