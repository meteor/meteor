patch = function(tgtParent, srcParent, tgtBefore, tgtAfter, preservations,
                 results) {

  var copyFunc = function(t, s) {
    LiveRange.transplantTag(TAG, t, s);
  };

  var patcher = new Patcher(
    tgtParent, srcParent, tgtBefore, tgtAfter);


  var visitNodes = function(parent, before, after, func) {
    for(var n = before ? before.nextSibling : parent.firstChild;
        n && n !== after;
        n = n.nextSibling) {
      if (func(n) !== false && n.firstChild)
        visitNodes(n, null, null, func);
    }
  };

  // results arg is optional; it is mutated if provided; returned either way
  results = (results || {});
  // array of LiveRanges that were successfully preserved from
  // the region preservations
  var regionPreservations = (results.regionPreservations =
                             results.regionPreservations || []);

  var lastTgtMatch = null;

  visitNodes(srcParent, null, null, function(src) {
    // XXX inefficient to scan for match for every node!
    // We could at least skip non-element nodes, except for "range matches"
    // used for constant chunks, which may begin on a non-element.
    // But really this shouldn't be a linear search.
    var pres = _.find(preservations, function (p) {
      // find preserved region starting at `src`, if any
      return p.type === 'region' && p.newRange.firstNode() === src;
    }) || _.find(preservations, function (p) {
      // else, find preservation of `src`
      return p.type === 'node' && p.to === src;
    });

    if (pres) {
      var tgt = (pres.type === 'region' ? pres.fromStart : pres.from);
      if (! lastTgtMatch ||
          DomUtils.compareElementIndex(lastTgtMatch, tgt) < 0) {
        if (pres.type === 'region') {
          // preserved region for constant landmark
          if (patcher.match(pres.fromStart, pres.newRange.firstNode(),
                            copyFunc, true)) {
            patcher.skipToSiblings(pres.fromEnd, pres.newRange.lastNode());
            // without knowing or caring what DOM nodes are in pres.newRange,
            // transplant the range data to pres.fromStart and pres.fromEnd
            // (including references to enclosing ranges).
            LiveRange.transplantRange(
              pres.fromStart, pres.fromEnd, pres.newRange);
            regionPreservations.push(pres.newRange);
          }
        } else if (pres.type === 'node') {
          if (patcher.match(tgt, src, copyFunc)) {
            // match succeeded
            lastTgtMatch = tgt;
            if (tgt.firstChild || src.firstChild) {
              if (tgt.nodeName !== "TEXTAREA" && tgt.nodeName !== "SELECT") {
                // Don't patch contents of TEXTAREA tag (which are only the
                // initial contents but may affect the tag's .value in IE) or of
                // SELECT (which is specially handled in _copyAttributes).
                // Otherwise recurse!
                patch(tgt, src, null, null, preservations);
              }
            }
            return false; // tell visitNodes not to recurse
          }
        }
      }
    }
    return true;
  });

  patcher.finish();

  return results;
};


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
// `finish`.
//
// A match is a correspondence between an old node in the target region
// and a new node in the source region that will replace it.  Based on
// this correspondence, the target node is preserved and the attributes
// and children of the source node are copied over it.  The `match`
// method declares such a correspondence.  A Patcher that makes no matches,
// for example, just removes the target nodes and inserts the source nodes
// in their place.
//
// Constructor:
Patcher = function(tgtParent, srcParent, tgtBefore, tgtAfter) {
  this.tgtParent = tgtParent;
  this.srcParent = srcParent;

  this.tgtBefore = tgtBefore;
  this.tgtAfter = tgtAfter;

  this.lastKeptTgtNode = null;
  this.lastKeptSrcNode = null;
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
Patcher.prototype.match = function(
  tgtNode, srcNode, copyCallback, onlyAdvance) {

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

  if (! starting) {
    // move lastKeptTgt/lastKeptSrc forward and out,
    // until they are siblings of tgt/src or of an ancestor of tgt/src,
    // replacing as we go.  If tgt/src is falsy, we make it to the
    // top level.
    while (lastKeptTgt.parentNode !== this.tgtParent &&
           ! (tgt && DomUtils.elementContains(lastKeptTgt.parentNode, tgt))) {
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
        (DomUtils.elementContains(lastKeptSrc, src) ||
         ! (lastKeptSrc.parentNode === this.srcParent ||
            DomUtils.elementContains(lastKeptSrc.parentNode, src)))) {
      return false;
    }
  }

  if (finishing) {
    this._replaceNodes(lastKeptTgt, null, lastKeptSrc, null,
                       this.tgtParent, this.srcParent);
  } else {
    // Compare tag names and depths to make sure we can match nodes...
    if (! onlyAdvance) {
      if (tgt.nodeName !== src.nodeName)
        return false;
    }

    // Look at tags of parents until we hit parent of last-kept,
    // which we know is ok.
    for(var a=tgt.parentNode, b=src.parentNode;
        a !== (starting ? this.tgtParent : lastKeptTgt.parentNode);
        a = a.parentNode, b = b.parentNode) {
      if (b === (starting ? this.srcParent : lastKeptSrc.parentNode))
        return false; // src is shallower, b hit top first
      if (a.nodeName !== b.nodeName)
        return false; // tag names don't match
    }
    if (b !== (starting ? this.srcParent : lastKeptSrc.parentNode)) {
      return false; // src is deeper, b didn't hit top when a did
    }

    var firstIter = true;
    // move tgt and src backwards and out, replacing as we go
    while (true) {
      if (! (firstIter && onlyAdvance)) {
        if (tgt.nodeType === 1) /* ELEMENT */
          Patcher._copyAttributes(tgt, src);
        if (copyCallback)
          copyCallback(tgt, src);
      }

      firstIter = false;

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

// After a match, skip ahead to later siblings of the last kept nodes,
// without performing any replacements.
Patcher.prototype.skipToSiblings = function(tgt, src) {
  var lastTgt = this.lastKeptTgtNode;
  var lastSrc = this.lastKeptSrcNode;

  if (! (lastTgt && lastTgt.parentNode === tgt.parentNode))
    return false;

  if (! (lastSrc && lastSrc.parentNode === src.parentNode))
    return false;

  this.lastKeptTgtNode = tgt;
  this.lastKeptSrcNode = src;

  return true;
};

// Completes patching assuming no more matches.
//
// Patchers are single-use, so no more methods can be called
// on the Patcher.
Patcher.prototype.finish = function() {
  return this.match(null, null);
};

// Replaces the siblings between tgtBefore and tgtAfter (exclusive on both
// sides) with the siblings between srcBefore and srcAfter (exclusive on both
// sides).  Falsy values indicate start or end of siblings as appropriate.
//
// Precondition: tgtBefore and tgtAfter have same parent; either may be falsy,
// but not both, unless optTgtParent is provided.  Same with srcBefore/srcAfter.
Patcher.prototype._replaceNodes = function(
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
Patcher._copyAttributes = function(tgt, src) {
  var srcAttrs = src.attributes;
  var tgtAttrs = tgt.attributes;

  // Determine whether tgt has focus; works in all browsers
  // as of FF3, Safari4
  var targetFocused = (tgt === document.activeElement);

  ///// Clear current attributes

  if (tgt.style.cssText)
    tgt.style.cssText = '';

  var isRadio = false;
  var finalChecked = null;
  if (tgt.nodeName === "INPUT") {
    // Record for later whether this is a radio button.
    isRadio = (tgt.type === 'radio');

    // Figure out whether this should be checked or not. If the re-rendering
    // changed its idea of checkedness, go with that; otherwsie go with whatever
    // the control's current setting is.
    if (isRadio || tgt.type === 'checkbox') {
      var tgtOriginalChecked = !!tgt._sparkOriginalRenderedChecked &&
            tgt._sparkOriginalRenderedChecked[0];
      var srcOriginalChecked = !!src._sparkOriginalRenderedChecked &&
            src._sparkOriginalRenderedChecked[0];
      // For radio buttons, we previously saved the checkedness in an expando
      // property before doing some DOM operations that could wipe it out. For
      // checkboxes, we can just use the checked property directly.
      var tgtCurrentChecked = tgt._currentChecked ?
            tgt._currentChecked[0] : tgt.checked;
      if (tgtOriginalChecked === srcOriginalChecked) {
        finalChecked = tgtCurrentChecked;
      } else {
        finalChecked = srcOriginalChecked;
        tgt._sparkOriginalRenderedChecked = [finalChecked];
      }
    }
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
    // Never delete the "value" attribute: we have special three-way diff logic
    // for it at the end.
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

    // Don't copy _sparkOriginalRenderedValue, though.
    var srcExpando = src._sparkOriginalRenderedValue;
    src.removeAttribute('_sparkOriginalRenderedValue');

    tgt.mergeAttributes(src);
    if (srcExpando)
      src._sparkOriginalRenderedValue = srcExpando;

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
          // handled specially below
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
          try {
            tgt.setAttribute(name, value);
          } catch (e) {
            throw new Error("Error copying attribute '" + name + "': " + e);
          }
        }
      }
    }
  }

  var originalRenderedValue = function (node) {
    if (!node._sparkOriginalRenderedValue)
      return null;
    return node._sparkOriginalRenderedValue[0];
  };
  var srcOriginalRenderedValue = originalRenderedValue(src);
  var tgtOriginalRenderedValue = originalRenderedValue(tgt);

  // Save the target's current value.
  var tgtCurrentValue = DomUtils.getElementValue(tgt);

  if (tgt.nodeName === "SELECT") {
    // Copy over the descendents of the tag (eg, OPTIONs, OPTGROUPs, etc) so
    // that we get the new version's OPTIONs. (We don't look for any more nested
    // preserved regions inside the element.)
    while (tgt.firstChild)
      tgt.removeChild(tgt.firstChild);
    while (src.firstChild)
      tgt.insertBefore(src.firstChild, null);
    // ... but preserve the original <SELECT>'s value if possible (ie, ignore
    // any <OPTION SELECTED>s that we may have copied over).
    DomUtils.setElementValue(tgt, tgtCurrentValue);
  }

  // We preserve the old element's value unless both of the following are true:
  //   - The newly rendered value is different from the old rendered value: ie,
  //     something has actually changed on the server.
  //   - It's unfocused. If it's focused, the user might be editing it, and
  //     we don't want to update what the user is currently editing (and lose
  //     the selection, etc).
  //
  // After updating the element's value, we update its
  // _sparkOriginalRenderedValue to match.
  //
  // There's a case where we choose to update _sparkOriginalRenderedValue even
  // though we're not updating the visible value. That's when the element is
  // focused (preventing us from updating the visible value), but the newly
  // rendered value matches the visible value. In this case, updating the
  // visible value would have been a no-op, so we can do the matching
  // _sparkOriginalRenderedValue update.
  //
  // Note that we expect src._sparkOriginalRenderedValue[0] to be equal to
  // src.value. For <LI>'s, though, there is a value property (the ordinal in
  // the list) even though there is no value attribute (and thus no saved
  // _sparkOriginalRenderedValue), so we do have to be sure to do the comparison
  // with src._sparkOriginalRenderedValue[0] rather than with src.value.
  if (srcOriginalRenderedValue !== tgtOriginalRenderedValue &&
      (tgtCurrentValue === srcOriginalRenderedValue || !targetFocused)) {
    // Update the on-screen value to the newly rendered value, but only if it's
    // an actual change (a seemingly "no-op" value update resets the selection,
    // so don't do that!)
    if (tgtCurrentValue !== srcOriginalRenderedValue)
      DomUtils.setElementValue(tgt, srcOriginalRenderedValue);
    // ... and overwrite the saved rendered value too, so that the next time
    // around we'll be comparing to this rendered value instead of the old one.
    tgt._sparkOriginalRenderedValue = [srcOriginalRenderedValue];
  }

  // Deal with checkboxes and radios.
  if (finalChecked !== null) {
    // Don't do a no-op write to 'checked', since in some browsers that triggers
    // events.
    if (tgt.checked !== finalChecked)
      tgt.checked = finalChecked;

    // Set various other fields related to checkedness.
    tgt.defaultChecked = finalChecked;
    if (finalChecked)
      tgt.setAttribute("checked", "checked");
    else
      tgt.removeAttribute("checked");
  }
};

SparkTest.Patcher = Patcher;
