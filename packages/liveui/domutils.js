Meteor.ui = Meteor.ui || {};

// returns true if element a properly contains element b
Meteor.ui._elementContains = function(a, b) {
  // Note: Some special-casing would be required to implement this method
  // where a and b aren't necessarily elements, e.g. b is a text node,
  // because contains() doesn't seem to work reliably on some browsers
  // including IE.
  if (a.nodeType !== 1 || b.nodeType !== 1) {
    return false; // a and b are not both elements
  }
  if (a.compareDocumentPosition) {
    return a.compareDocumentPosition(b) & 0x10;
  } else {
    // Should be only old IE and maybe other old browsers here.
    // Modern Safari has both methods but seems to get contains() wrong.
    return a !== b && a.contains(b);
  }
};

// Returns an array of element nodes matching `selector`, where
// the selector is interpreted as rooted at `contextNode`.
// This means that all nodes that participate in the selector
// must be descendents on contextNode.
//
// jQuery dependency to eventually replace with querySelectorAll
// backed up by Sizzle in Old IE.  Note that querySelectorAll doesn't
// provide the needed semantics for scoping the selector to contextNode;
// for example, myDiv.querySelectorAll("body *") will match all of myDiv's
// descendents, while $(myDiv).find("body *") won't match any.  The latter
// behavior is definitely better, and the way to implement it is to temporarily
// assign an ID to contextNode (if it doesn't have one).
Meteor.ui._findElement = function(contextNode, selector) {
  if (contextNode.nodeType === 11 /* DocumentFragment */) {
    // Sizzle doesn't work on a DocumentFragment, but it does work on
    // a descendent of one.
    var frag = contextNode;
    var container = Meteor.ui._fragmentToContainer(frag);
    var results = $(container).find(selector);
    // put nodes back into frag
    while (container.firstChild)
      frag.appendChild(container.firstChild);
    return results;
  } else {
    return $(contextNode).find(selector);
  }
};

// Requires: `a` and `b` are element nodes in the same document tree.
// Returns 0 if the nodes are the same or either one contains the other;
// otherwise, 1 if (a,b) are in order and -1 if they are in the opposite order.
Meteor.ui._elementOrder = function(a, b) {
  // See http://ejohn.org/blog/comparing-document-position/
  if (a === b)
    return 0;
  if (a.compareDocumentPosition) {
    var n = a.compareDocumentPosition(b);
    return ((n & 0x18) ? 0 : ((n & 0x4) ? 1 : -1));
  } else {
    // Only old IE is known to not have compareDocumentPosition (though Safari
    // originally lacked it).  Thankfully, IE gives us a way of comparing elements
    // via the "sourceIndex" property.
    if (a.contains(b) || b.contains(a))
      return 0;
    return (a.sourceIndex < b.sourceIndex ? 1 : -1);
  }
};

// Like `findElement` but uses a hypothetical LiveRange wrapping start..end
// as the context.
Meteor.ui._findElementInRange = function(start, end, selector) {
  end = (end || start);

  var container = start.parentNode;
  if (! container) {
    if (start === end && (start.nodeType === 9 /* Document */ ||
                          start.nodeType === 11 /* DocumentFragment */))
      return Meteor.ui._findElement(start, selector);
    throw new Error("Can't find element in range on detached node");
  }
  if (end.parentNode !== container)
    throw new Error("Bad range");

  // narrow the range to exclude top-level non-elements (which can't be
  // or contain matches) by moving the `start` pointer forward and `end`
  // backward.
  while (start !== end && start.nodeType !== 1)
    start = start.nextSibling;
  while (start !== end && end.nodeType !== 1)
    end = end.previousSibling;
  if (start.nodeType !== 1)
    return []; // no top-level elements!  start === end and it's not an element

  // resultsPlus includes matches that are contained by the range's
  // parent, but are outside of start..end, i.e. are descended from
  // (or are) a different sibling.
  var resultsPlus = Meteor.ui._findElement(container, selector);

  // Filter the list of nodes to remove nodes that occur before start
  // or after end.
  return _.reject(resultsPlus, function(n) {
    // reject node if (n,start) are in order or (end,n) are in order
    return (Meteor.ui._elementOrder(n, start) > 0) ||
      (Meteor.ui._elementOrder(end, n) > 0);
  });
};

// Check whether a node is contained in the document.
Meteor.ui._isNodeOnscreen = function (node) {
  // Deal with all cases where node is not an element
  // node descending from the body first...
  if (node === document)
    return true;

  if (node.nodeType !== 1 /* Element */)
    node = node.parentNode;
  if (! (node && node.nodeType === 1))
    return false;
  if (node === document.body)
    return true;

  return Meteor.ui._elementContains(document.body, node);
};
