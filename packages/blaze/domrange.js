
// A constant empty array (frozen if the JS engine supports it).
var _emptyArray = Object.freeze ? Object.freeze([]) : [];

// `[new] Blaze._DOMRange([nodeAndRangeArray])`
//
// A DOMRange consists of an array of consecutive nodes and DOMRanges,
// which may be replaced at any time with a new array.  If the DOMRange
// has been attached to the DOM at some location, then updating
// the array will cause the DOM to be updated at that location.
Blaze._DOMRange = function (nodeAndRangeArray) {
  if (! (this instanceof DOMRange))
    // called without `new`
    return new DOMRange(nodeAndRangeArray);

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
  this.attachedCallbacks = _emptyArray;
};
var DOMRange = Blaze._DOMRange;

// In IE 8, don't use empty text nodes as placeholders
// in empty DOMRanges, use comment nodes instead.  Using
// empty text nodes in modern browsers is great because
// it doesn't clutter the web inspector.  In IE 8, however,
// it seems to lead in some roundabout way to the OAuth
// pop-up crashing the browser completely.  In the past,
// we didn't use empty text nodes on IE 8 because they
// don't accept JS properties, so just use the same logic
// even though we don't need to set properties on the
// placeholder anymore.
DOMRange._USE_COMMENT_PLACEHOLDERS = (function () {
  var result = false;
  var textNode = document.createTextNode("");
  try {
    textNode.someProp = true;
  } catch (e) {
    // IE 8
    result = true;
  }
  return result;
})();

// static methods
DOMRange._insert = function (rangeOrNode, parentElement, nextNode, _isMove) {
  var m = rangeOrNode;
  if (m instanceof DOMRange) {
    m.attach(parentElement, nextNode, _isMove);
  } else {
    if (_isMove)
      DOMRange._moveNodeWithHooks(m, parentElement, nextNode);
    else
      DOMRange._insertNodeWithHooks(m, parentElement, nextNode);
  }
};

DOMRange._remove = function (rangeOrNode) {
  var m = rangeOrNode;
  if (m instanceof DOMRange) {
    m.detach();
  } else {
    DOMRange._removeNodeWithHooks(m);
  }
};

DOMRange._removeNodeWithHooks = function (n) {
  if (! n.parentNode)
    return;
  if (n.nodeType === 1 &&
      n.parentNode._uihooks && n.parentNode._uihooks.removeElement) {
    n.parentNode._uihooks.removeElement(n);
  } else {
    n.parentNode.removeChild(n);
  }
};

DOMRange._insertNodeWithHooks = function (n, parent, next) {
  // `|| null` because IE throws an error if 'next' is undefined
  next = next || null;
  if (n.nodeType === 1 &&
      parent._uihooks && parent._uihooks.insertElement) {
    parent._uihooks.insertElement(n, next);
  } else {
    parent.insertBefore(n, next);
  }
};

DOMRange._moveNodeWithHooks = function (n, parent, next) {
  if (n.parentNode !== parent)
    return;
  // `|| null` because IE throws an error if 'next' is undefined
  next = next || null;
  if (n.nodeType === 1 &&
      parent._uihooks && parent._uihooks.moveElement) {
    parent._uihooks.moveElement(n, next);
  } else {
    parent.insertBefore(n, next);
  }
};

DOMRange.forElement = function (elem) {
  if (elem.nodeType !== 1)
    throw new Error("Expected element, found: " + elem);
  var range = null;
  while (elem && ! range) {
    range = (elem.$blaze_range || null);
    if (! range)
      elem = elem.parentNode;
  }
  return range;
};

DOMRange.prototype.attach = function (parentElement, nextNode, _isMove, _isReplace) {
  // This method is called to insert the DOMRange into the DOM for
  // the first time, but it's also used internally when
  // updating the DOM.
  //
  // If _isMove is true, move this attached range to a different
  // location under the same parentElement.
  if (_isMove || _isReplace) {
    if (! (this.parentElement === parentElement &&
           this.attached))
      throw new Error("Can only move or replace an attached DOMRange, and only under the same parent element");
  }

  var members = this.members;
  if (members.length) {
    this.emptyRangePlaceholder = null;
    for (var i = 0; i < members.length; i++) {
      DOMRange._insert(members[i], parentElement, nextNode, _isMove);
    }
  } else {
    var placeholder = (
      DOMRange._USE_COMMENT_PLACEHOLDERS ?
        document.createComment("") :
        document.createTextNode(""));
    this.emptyRangePlaceholder = placeholder;
    parentElement.insertBefore(placeholder, nextNode || null);
  }
  this.attached = true;
  this.parentElement = parentElement;

  if (! (_isMove || _isReplace)) {
    for(var i = 0; i < this.attachedCallbacks.length; i++) {
      var obj = this.attachedCallbacks[i];
      obj.attached && obj.attached(this, parentElement);
    }
  }
};

DOMRange.prototype.setMembers = function (newNodeAndRangeArray) {
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
      // Use detach/attach, but don't fire attached/detached hooks
      this.detach(true /*_isReplace*/);
      this.members = newMembers;
      this.attach(parentElement, nextNode, false, true /*_isReplace*/);
    }
  }
};

DOMRange.prototype.firstNode = function () {
  if (! this.attached)
    throw new Error("Must be attached");

  if (! this.members.length)
    return this.emptyRangePlaceholder;

  var m = this.members[0];
  return (m instanceof DOMRange) ? m.firstNode() : m;
};

DOMRange.prototype.lastNode = function () {
  if (! this.attached)
    throw new Error("Must be attached");

  if (! this.members.length)
    return this.emptyRangePlaceholder;

  var m = this.members[this.members.length - 1];
  return (m instanceof DOMRange) ? m.lastNode() : m;
};

DOMRange.prototype.detach = function (_isReplace) {
  if (! this.attached)
    throw new Error("Must be attached");

  var oldParentElement = this.parentElement;
  var members = this.members;
  if (members.length) {
    for (var i = 0; i < members.length; i++) {
      DOMRange._remove(members[i]);
    }
  } else {
    var placeholder = this.emptyRangePlaceholder;
    this.parentElement.removeChild(placeholder);
    this.emptyRangePlaceholder = null;
  }

  if (! _isReplace) {
    this.attached = false;
    this.parentElement = null;

    for(var i = 0; i < this.attachedCallbacks.length; i++) {
      var obj = this.attachedCallbacks[i];
      obj.detached && obj.detached(this, oldParentElement);
    }
  }
};

DOMRange.prototype.addMember = function (newMember, atIndex, _isMove) {
  var members = this.members;
  if (! (atIndex >= 0 && atIndex <= members.length))
    throw new Error("Bad index in range.addMember: " + atIndex);

  if (! _isMove)
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
      var m = members[atIndex];
      nextNode = (m instanceof DOMRange) ? m.firstNode() : m;
    }
    members.splice(atIndex, 0, newMember);
    DOMRange._insert(newMember, this.parentElement, nextNode, _isMove);
  }
};

DOMRange.prototype.removeMember = function (atIndex, _isMove) {
  var members = this.members;
  if (! (atIndex >= 0 && atIndex < members.length))
    throw new Error("Bad index in range.removeMember: " + atIndex);

  if (_isMove) {
    members.splice(atIndex, 1);
  } else {
    var oldMember = members[atIndex];
    this._memberOut(oldMember);

    if (members.length === 1) {
      // becoming empty; use the logic in setMembers
      this.setMembers(_emptyArray);
    } else {
      members.splice(atIndex, 1);
      if (this.attached)
        DOMRange._remove(oldMember);
    }
  }
};

DOMRange.prototype.moveMember = function (oldIndex, newIndex) {
  var member = this.members[oldIndex];
  this.removeMember(oldIndex, true /*_isMove*/);
  this.addMember(member, newIndex, true /*_isMove*/);
};

DOMRange.prototype.getMember = function (atIndex) {
  var members = this.members;
  if (! (atIndex >= 0 && atIndex < members.length))
    throw new Error("Bad index in range.getMember: " + atIndex);
  return this.members[atIndex];
};

DOMRange.prototype._memberIn = function (m) {
  if (m instanceof DOMRange)
    m.parentRange = this;
  else if (m.nodeType === 1) // DOM Element
    m.$blaze_range = this;
};

DOMRange._destroy = function (m, _skipNodes) {
  if (m instanceof DOMRange) {
    if (m.view)
      Blaze._destroyView(m.view, _skipNodes);
  } else if ((! _skipNodes) && m.nodeType === 1) {
    // DOM Element
    if (m.$blaze_range) {
      Blaze._destroyNode(m);
      m.$blaze_range = null;
    }
  }
};

DOMRange.prototype._memberOut = DOMRange._destroy;

// Tear down, but don't remove, the members.  Used when chunks
// of DOM are being torn down or replaced.
DOMRange.prototype.destroyMembers = function (_skipNodes) {
  var members = this.members;
  for (var i = 0; i < members.length; i++)
    this._memberOut(members[i], _skipNodes);
};

DOMRange.prototype.destroy = function (_skipNodes) {
  DOMRange._destroy(this, _skipNodes);
};

DOMRange.prototype.containsElement = function (elem) {
  if (! this.attached)
    throw new Error("Must be attached");

  // An element is contained in this DOMRange if it's possible to
  // reach it by walking parent pointers, first through the DOM and
  // then parentRange pointers.  In other words, the element or some
  // ancestor of it is at our level of the DOM (a child of our
  // parentElement), and this element is one of our members or
  // is a member of a descendant Range.

  // First check that elem is a descendant of this.parentElement,
  // according to the DOM.
  if (! Blaze._elementContains(this.parentElement, elem))
    return false;

  // If elem is not an immediate child of this.parentElement,
  // walk up to its ancestor that is.
  while (elem.parentNode !== this.parentElement)
    elem = elem.parentNode;

  var range = elem.$blaze_range;
  while (range && range !== this)
    range = range.parentRange;

  return range === this;
};

DOMRange.prototype.containsRange = function (range) {
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
};

DOMRange.prototype.onAttached = function (attached) {
  this.onAttachedDetached({ attached: attached });
};

// callbacks are `attached(range, element)` and
// `detached(range, element)`, and they may
// access the `callbacks` object in `this`.
// The arguments to `detached` are the same
// range and element that were passed to `attached`.
DOMRange.prototype.onAttachedDetached = function (callbacks) {
  if (this.attachedCallbacks === _emptyArray)
    this.attachedCallbacks = [];
  this.attachedCallbacks.push(callbacks);
};

DOMRange.prototype.$ = function (selector) {
  var self = this;

  var parentNode = this.parentElement;
  if (! parentNode)
    throw new Error("Can't select in removed DomRange");

  // Strategy: Find all selector matches under parentNode,
  // then filter out the ones that aren't in this DomRange
  // using `DOMRange#containsElement`.  This is
  // asymptotically slow in the presence of O(N) sibling
  // content that is under parentNode but not in our range,
  // so if performance is an issue, the selector should be
  // run on a child element.

  // Since jQuery can't run selectors on a DocumentFragment,
  // we don't expect findBySelector to work.
  if (parentNode.nodeType === 11 /* DocumentFragment */)
    throw new Error("Can't use $ on an offscreen range");

  var results = Blaze._DOMBackend.findBySelector(selector, parentNode);

  // We don't assume `results` has jQuery API; a plain array
  // should do just as well.  However, if we do have a jQuery
  // array, we want to end up with one also, so we use
  // `.filter`.

  // Function that selects only elements that are actually
  // in this DomRange, rather than simply descending from
  // `parentNode`.
  var filterFunc = function (elem) {
    // handle jQuery's arguments to filter, where the node
    // is in `this` and the index is the first argument.
    if (typeof elem === 'number')
      elem = this;

    return self.containsElement(elem);
  };

  if (! results.filter) {
    // not a jQuery array, and not a browser with
    // Array.prototype.filter (e.g. IE <9)
    var newResults = [];
    for (var i = 0; i < results.length; i++) {
      var x = results[i];
      if (filterFunc(x))
        newResults.push(x);
    }
    results = newResults;
  } else {
    // `results.filter` is either jQuery's or ECMAScript's `filter`
    results = results.filter(filterFunc);
  }

  return results;
};

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
