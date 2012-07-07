Meteor.ui = Meteor.ui || {};

// A Patcher manages the controlled replacement of a region of the DOM.
// The target region is changed in place to match the source region.
//
// The target region consists of the children of tgtParent, extending from
// the child after tgtBefore to the child before tgtAfter.  A null
// or absent tgtBefore or tgtAfter represents the beginning or end
// of tgtParent's children.  The source region consists of all children
// of srcParent, which may be a DocumentFragment.
//
// To use a new Patcher, call `match` zero or more times followed by
// `finish`.  Alternatively, just call `diffpatch` to use the standard
// matching strategy.
//
// A match is a correspondence between an old node in the target region
// and a new node in the source region that will replace it.  Based on
// this correspondence, the target node is preserved and the attributes
// and children of the source node are copied over it.  The `match`
// method declares such a correspondence.  The `diffpatch` method
// determines the correspondences and calls `match` and `finish`.
// A Patcher that makes no matches just removes the target nodes
// and inserts the source nodes in their place.
//
// Constructor:
Meteor.ui._Patcher = function(tgtParent, srcParent, tgtBefore, tgtAfter) {
  this.tgtParent = tgtParent;
  this.srcParent = srcParent;

  this.tgtBefore = tgtBefore;
  this.tgtAfter = tgtAfter;

  this.lastKeptTgtNode = null;
  this.lastKeptSrcNode = null;
};

// Perform a complete patching where nodes with the same `id` or `name`
// are matched.
//
// Any node that has either an "id" or "name" attribute is considered a
// "labeled" node, and these labeled nodes are candidates for preservation.
// For two labeled nodes, old and new, to match, they first must have the same
// label (that is, they have the same id, or neither has an id and they have
// the same name).  Labels are considered relative to the nearest enclosing
// labeled ancestor, and must be unique among the labeled nodes that share
// this nearest labeled ancestor.  Labeled nodes are also expected to stay
// in the same order, or else some of them won't be matched.

Meteor.ui._Patcher.prototype.diffpatch = function(copyCallback) {
  var self = this;

  var each_labeled_node = function(parent, before, after, func) {
    for(var n = before ? before.nextSibling : parent.firstChild;
        n && n !== after;
        n = n.nextSibling) {

      var label = null;

      if (n.nodeType === 1) {
        if (n.id) {
          label = '#'+n.id;
        } else if (n.getAttribute("name")) {
          label = n.getAttribute("name");
          // Radio button special case:  radio buttons
          // in a group all have the same name.  Their value
          // determines their identity.
          // Checkboxes with the same name and different
          // values are also sometimes used in apps, so
          // we treat them similarly.
          if (n.nodeName === 'INPUT' &&
              (n.type === 'radio' || n.type === 'checkbox') &&
              n.value)
            label = label + ':' + n.value;
        }
      }

      if (label)
        func(label, n);
      else
        // not a labeled node; recurse
        each_labeled_node(n, null, null, func);
    }
  };


  var targetNodes = {};
  var targetNodeOrder = {};
  var targetNodeCounter = 0;

  each_labeled_node(
    self.tgtParent, self.tgtBefore, self.tgtAfter,
    function(label, node) {
      targetNodes[label] = node;
      targetNodeOrder[label] = targetNodeCounter++;
    });

  var lastPos = -1;
  each_labeled_node(
    self.srcParent, null, null,
    function(label, node) {
      var tgt = targetNodes[label];
      var src = node;
      if (tgt && targetNodeOrder[label] > lastPos) {
        if (self.match(tgt, src, copyCallback)) {
          // match succeeded
          if (tgt.firstChild || src.firstChild) {
            // Don't patch contents of TEXTAREA tag,
            // which are only the initial contents but
            // may affect the tag's .value in IE.
            if (tgt.nodeName !== "TEXTAREA") {
              // recurse with a new Patcher!
              var patcher = new Meteor.ui._Patcher(tgt, src);
              patcher.diffpatch(copyCallback);
            }
          }
        }
        lastPos = targetNodeOrder[label];
      }
    });

  self.finish();

};


// Advances the patching process up to tgtNode in the target tree,
// and srcNode in the source tree.  tgtNode will be preserved, with
// the attributes of srcNode copied over it, in essence identifying
// the two nodes with each other.  The same treatment is given to
// any parents of the nodes that are newly implicated as corresponding.
// In the process of traversing from the last matched nodes to these
// ones, all nodes "in between" in the target document, at any level,
// are removed, and all nodes "in between" in the source document
// are copied over to their appropriate positions.
//
// For example, if match() is called only once, and then finish()
// is called, the effect is to preserve tgtNode, its children,
// and its ancestors (parent chain), while swapping out all its
// siblings and the siblings of its ancestors, so that the target
// tree is mutated to look like the source tree did.
//
// The caller is responsible for ensuring the precondition that
// subsequent tgtNodes and subsequent srcNodes are strictly "in order."
// The ordering referred to here is a partial order in which A comes
// before B if their tags would be disjoint in HTML, i.e. the end of
// A comes before the beginning of B.  Put another way, there is some
// ancestor of A and some ancestor of B that have the same parent,
// are different, and are in order.
//
// There are other requirements for two nodes to be "matched,"
// but match() can detect them and exit gracefully returning false.
// For example, the tag-names must be the same, and the tag-names
// of their parents.  More subtly, it may be impossible to match
// the parents of tgtNode or srcNode because they have been
// previously matched.  If we are to match a series of P tags
// that are each inside one DIV, for example, is it the same DIV
// or not?  If the source and target disagree, we will have to
// reparent one of the Ps.  Users should not be moving identified
// nodes, but we want to still be correct (fall back on replacement)
// if they do.
//
// If false is returned, the match was impossible, but patching
// can continue and will still be otherwise correct.  The next call
// to match() must still obey the order constraint, as the patcher
// internally only moves forwards and patches as it goes.
//
// copyCallback is called on every new matched (tgt, src) pair
// right after copying attributes.  It's a good time to transplant
// liveranges and patch children.
Meteor.ui._Patcher.prototype.match = function(tgtNode, srcNode, copyCallback) {

  // last nodes "kept" (matched/identified with each other)
  var lastKeptTgt = this.lastKeptTgtNode;
  var lastKeptSrc = this.lastKeptSrcNode;
  // nodes to match and keep, this time around
  var tgt = tgtNode;
  var src = srcNode;

  if ((! tgt) != (! src)) {
    return false; // truthinesses don't match
  }

  var starting = ! lastKeptTgt;
  var finishing = ! tgt;
  var elementContains = Meteor.ui._Patcher._elementContains;

  if (! starting) {
    // move lastKeptTgt/lastKeptSrc forward and out,
    // until they are siblings of tgt/src or of an ancestor of tgt/src,
    // replacing as we go.  If tgt/src is falsy, we make it to the
    // top level.
    while (lastKeptTgt.parentNode !== this.tgtParent &&
           ! (tgt && elementContains(lastKeptTgt.parentNode, tgt))) {
      // Last-kept nodes are inside parents that are not
      // parents of the newly matched nodes.  Must finish
      // replacing their contents and back out.
      this._replaceNodes(lastKeptTgt, null, lastKeptSrc, null);
      lastKeptTgt = lastKeptTgt.parentNode;
      lastKeptSrc = lastKeptSrc.parentNode;
    }

    // update instance vars; there's no going back inside these nodes
    this.lastKeptTgtNode = lastKeptTgt;
    this.lastKeptSrcNode = lastKeptSrc;

    // Make sure same number of levels of "moving up" are
    // appropriate for src as well, i.e. we aren't trying
    // to match <c> in (<a><b/><c/></a>, <a><b/></a><a><c/></a>)
    // after matching <b>, or vice versa.  In other words,
    // if tag names and depths match, but identities of parents
    // are inconsistent relative to previous matches, we catch it
    // here.  In the example, lastKeptTgt would be the <b/> node
    // on the left, which is not sibling of <c/> or of an ancestor
    // of <c/> on the right.  If the example were reversed,
    // lastKeptTgt would be the first <a> node, which is an
    // ancestor of <c/> on the left rather than a sibling of an
    // ancestor.
    if (! finishing &&
        (elementContains(lastKeptSrc, src) ||
         ! (lastKeptSrc.parentNode === this.srcParent ||
            elementContains(lastKeptSrc.parentNode, src)))) {
      return false;
    }
  }

  if (finishing) {
    this._replaceNodes(lastKeptTgt, null, lastKeptSrc, null,
                       this.tgtParent, this.srcParent);
  } else {
    // Compare tag names and depths to make sure we can match nodes.
    // Look at tags of parents until we hit parent of last-kept,
    // which we know is ok.
    for(var a=tgt, b=src;
        a !== (starting ? this.tgtParent : lastKeptTgt.parentNode);
        a = a.parentNode, b = b.parentNode) {
      if (b === (starting ? this.srcParent : lastKeptSrc.parentNode)) {
        return false; // src is shallower, b hit top first
      }
      if (a.nodeName !== b.nodeName) {
        return false; // tag names don't match
      }
    }
    if (b !== (starting ? this.srcParent : lastKeptSrc.parentNode)) {
      return false; // src is deeper, b didn't hit top when a did
    }

    // move tgt and src backwards and out, replacing as we go
    while (true) {
      Meteor.ui._Patcher._copyAttributes(tgt, src);
      if (copyCallback)
        copyCallback(tgt, src);

      if ((starting ? this.tgtParent : lastKeptTgt.parentNode)
          === tgt.parentNode) {
        // we've worked our way up to the same level as the last-kept nodes
        this._replaceNodes(lastKeptTgt, tgt, lastKeptSrc, src);
        break;
      } else {
        this._replaceNodes(null, tgt, null, src);
        // move up to keep (match) parents as well
        tgt = tgt.parentNode;
        src = src.parentNode;
      }
    }
  }

  this.lastKeptTgtNode = tgtNode;
  this.lastKeptSrcNode = srcNode;

  return true;
};

// Completes patching assuming no more matches.
//
// Patchers are single-use, so no more methods can be called
// on the Patcher.
Meteor.ui._Patcher.prototype.finish = function() {
  return this.match(null, null);
};

// Replaces the siblings between tgtBefore and tgtAfter (exclusive on both
// sides) with the siblings between srcBefore and srcAfter (exclusive on both
// sides).  Falsy values indicate start or end of siblings as appropriate.
//
// Precondition: tgtBefore and tgtAfter have same parent; either may be falsy,
// but not both, unless optTgtParent is provided.  Same with srcBefore/srcAfter.
Meteor.ui._Patcher.prototype._replaceNodes = function(
  tgtBefore, tgtAfter, srcBefore, srcAfter, optTgtParent, optSrcParent)
{
  var tgtParent = optTgtParent || (tgtBefore || tgtAfter).parentNode;
  var srcParent = optSrcParent || (srcBefore || srcAfter).parentNode;

  // deal with case where top level is a range
  if (tgtParent === this.tgtParent) {
    tgtBefore = tgtBefore || this.tgtBefore;
    tgtAfter = tgtAfter || this.tgtAfter;
  }
  if (srcParent === this.srcParent) {
    srcBefore = srcBefore || this.srcBefore;
    srcAfter = srcAfter || this.srcAfter;
  }


  // remove old children
  var n;
  while ((n = tgtBefore ? tgtBefore.nextSibling : tgtParent.firstChild)
         && n !== tgtAfter) {
    tgtParent.removeChild(n);
  }

  // add new children
  var m;
  while ((m = srcBefore ? srcBefore.nextSibling : srcParent.firstChild)
         && m !== srcAfter) {
    tgtParent.insertBefore(m, tgtAfter || null);
  }
};

// Copy HTML attributes of node `src` onto node `tgt`.
//
// The effect we are trying to achieve is best expresed in terms of
// HTML.  Whatever HTML generated `tgt`, we want to mutate the DOM element
// so that it is as if it were the HTML that generated `src`.
// We want to preserve JavaScript properties in general (tgt.foo),
// while syncing the HTML attributes (tgt.getAttribute("foo")).
//
// This is complicated by form controls and the fact that old IE
// can't keep the difference straight between properties and attributes.
Meteor.ui._Patcher._copyAttributes = function(tgt, src) {
  var srcAttrs = src.attributes;
  var tgtAttrs = tgt.attributes;

  // Determine whether tgt has focus; works in all browsers
  // as of FF3, Safari4
  var target_focused = (tgt === document.activeElement);

  // Is this a control with a user-mutated "value" property?
  var has_user_value = (
    (tgt.nodeName === "INPUT" &&
     (tgt.type === "text")) ||
      tgt.nodeName === "TEXTAREA");

  ///// Clear current attributes

  if (tgt.style.cssText)
    tgt.style.cssText = '';

  var isRadio = false;
  if (tgt.nodeName === "INPUT") {
    // Record for later whether this is a radio button.
    isRadio = (tgt.type === 'radio');
    // Clearing the attributes of a checkbox won't necessarily
    // uncheck it, eg in FF12, so we uncheck explicitly.
    if (typeof tgt.checked === "boolean")
      tgt.checked = false;
  }

  for(var i=tgtAttrs.length-1; i>=0; i--) {
    var attr = tgtAttrs[i];
    // In old IE, attributes that are possible on a node
    // but not actually present will show up in this loop
    // with specified=false.  All other browsers support
    // 'specified' (because it's part of the spec) and
    // set it to true.
    if (! attr.specified)
      continue;
    var name = attr.name;
    // Filter out attributes that are indexable by number
    // but not by name.  This kills the weird "propdescname"
    // attribute in IE 8.
    if (! tgtAttrs[name])
      continue;
    // Some properties don't mutate well, and we simply
    // don't try to patch them.  For example, you can't
    // change a control's type in IE.
    if (name === "id" || name === "type")
      continue;
    // Removing a radio button's "name" property and restoring
    // it is harmless in most browsers but breaks in IE 7.
    // It seems unlikely enough that a radio button will
    // sometimes have a group and sometimes not.
    if (isRadio && name === "name")
      continue;
    // Never delete the "value" attribute.  It's more effective
    // to simply overwrite it in the next phase.
    if (name === "value")
      continue;
    // Removing 'src' (e.g. in an iframe) can only be bad.
    if (name === "src")
      continue;

    // We want to patch any HTML attributes that were specified in the
    // source, but preserve DOM properties set programmatically.
    // Old IE makes this difficult by exposing properties as attributes.
    // Expando properties will even appear in innerHTML, though not if the
    // value is an object rather than a primitive.
    //
    // We use a heuristic to determine if we are looking at a programmatic
    // property (an expando) rather than a DOM attribute.
    //
    // Losing jQuery's expando (whose value is a number) is very bad,
    // because it points to event handlers that only jQuery can detach,
    // and only if the expando is in place.
    var possibleExpando = tgt[name];
    if (possibleExpando &&
        (typeof possibleExpando === "object" ||
         /^jQuery/.test(name)))
      continue; // for object properties that surface attributes only in IE
    tgt.removeAttributeNode(attr);
  }

  ///// Copy over src's attributes

  if (tgt.mergeAttributes) {
    // IE code path:
    //
    // Only IE (all versions) has mergeAttributes.
    // It's probably a good bit faster in old IE than
    // iterating over all the attributes, and the treatment
    // of form controls is sufficiently different in IE from
    // other browsers that we keep the special cases separate.

    tgt.mergeAttributes(src);

    if (typeof tgt.checked !== "undefined" ||
        typeof src.checked !== "undefined")
      tgt.checked = src.checked;

    if (src.name)
      tgt.name = src.name;

  } else {
    // Non-IE code path:

    for(var i=0, L=srcAttrs.length; i<L; i++) {
      var srcA = srcAttrs.item(i);
      if (srcA.specified) {
        var name = srcA.name.toLowerCase();
        var value = String(srcA.value);
        if (name === "type") {
        // can't change type of INPUT in IE; don't support it
        } else if (name === "checked") {
          tgt.checked = tgt.defaultChecked = (value && value !== "false");
          tgt.setAttribute("checked", "checked");
        } else if (name === "style") {
          tgt.style.cssText = src.style.cssText;
        } else if (name === "class") {
          tgt.className = src.className;
        } else if (name === "value") {
          // don't set attribute, just overwrite property
          // (in next phase)
        } else if (name === "src") {
          // only set if different.  protects iframes
          if (src.src !== tgt.src)
            tgt.src = src.src;
        } else {
          tgt.setAttribute(name, value);
        }
      }
    }
  }

  // Copy the control's value, only if tgt doesn't have focus.
  if (has_user_value) {
    if (! target_focused)
      tgt.value = src.value;
  }

};

// returns true if element a properly contains element b
Meteor.ui._Patcher._elementContains = function(a, b) {
  if (a.nodeType !== 1 || b.nodeType !== 1) {
    return false;
  }
  if (a.compareDocumentPosition) {
    return a.compareDocumentPosition(b) & 0x10;
  } else {
    // Should be only old IE and maybe other old browsers here.
    // Modern Safari has both methods but seems to get contains() wrong.
    return a !== b && a.contains(b);
  }
};
