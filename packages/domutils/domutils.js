

DomUtils = {};

(function() {

  ///// Common look-up tables used by htmlToFragment et al.

  var testDiv = document.createElement("div");
  testDiv.innerHTML = "   <link/><table></table>";

  // Tests that, if true, indicate browser quirks present.
  var quirks = {
    // IE loses initial whitespace when setting innerHTML.
    leadingWhitespaceKilled: (testDiv.firstChild.nodeType !== 3),

    // IE may insert an empty tbody tag in a table.
    tbodyInsertion: testDiv.getElementsByTagName("tbody").length > 0,

    // IE loses some tags in some environments (requiring extra wrapper).
    tagsLost: testDiv.getElementsByTagName("link").length === 0
  };

  // Set up map of wrappers for different nodes.
  var wrapMap = {
    option: [ 1, "<select multiple='multiple'>", "</select>" ],
    legend: [ 1, "<fieldset>", "</fieldset>" ],
    thead: [ 1, "<table>", "</table>" ],
    tr: [ 2, "<table><tbody>", "</tbody></table>" ],
    td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],
    col: [ 2, "<table><tbody></tbody><colgroup>", "</colgroup></table>" ],
    area: [ 1, "<map>", "</map>" ],
    _default: [ 0, "", "" ]
  };
  _.extend(wrapMap, {
    optgroup: wrapMap.option,
    tbody: wrapMap.thead,
    tfoot: wrapMap.thead,
    colgroup: wrapMap.thead,
    caption: wrapMap.thead,
    th: wrapMap.td
  });
  if (quirks.tagsLost) {
    // trick from jquery.  initial text is ignored when we take lastChild.
    wrapMap._default = [ 1, "div<div>", "</div>" ];
  }

  var rleadingWhitespace = /^\s+/,
      rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/ig,
      rtagName = /<([\w:]+)/,
      rtbody = /<tbody/i,
      rhtml = /<|&#?\w+;/,
      rnoInnerhtml = /<(?:script|style)/i;


  // Parse an HTML string, which may contain multiple top-level tags,
  // and return a DocumentFragment.
  DomUtils.htmlToFragment = function(html) {
    var doc = document; // node factory
    var frag = doc.createDocumentFragment();

    if (! html.length) {
      // empty, do nothing
    } else if (! rhtml.test(html)) {
      // Just text.
      frag.appendChild(doc.createTextNode(html));
    } else {
      // General case.
      // Replace self-closing tags
      html = html.replace(rxhtmlTag, "<$1></$2>");
      // Use first tag to determine wrapping needed.
      var firstTagMatch = rtagName.exec(html);
      var firstTag = (firstTagMatch ? firstTagMatch[1].toLowerCase() : "");
      var wrapData = wrapMap[firstTag] || wrapMap._default;

      var container = doc.createElement("div");
      // insert wrapped HTML into a DIV
      container.innerHTML = wrapData[1] + html + wrapData[2];
      // set "container" to inner node of wrapper
      var unwraps = wrapData[0];
      while (unwraps--) {
        container = container.lastChild;
      }

      if (quirks.tbodyInsertion && ! rtbody.test(html)) {
        // Any tbody we find was created by the browser.
        var tbodies = container.getElementsByTagName("tbody");
        _.each(tbodies, function(n) {
          if (! n.firstChild) {
            // spurious empty tbody
            n.parentNode.removeChild(n);
          }
        });
      }

      if (quirks.leadingWhitespaceKilled) {
        var wsMatch = rleadingWhitespace.exec(html);
        if (wsMatch) {
          container.insertBefore(doc.createTextNode(wsMatch[0]),
                                 container.firstChild);
        }
      }

      // Reparent children of container to frag.
      while (container.firstChild)
        frag.appendChild(container.firstChild);
    }

    return frag;
  };

  // Return an HTML string representing the contents of frag,
  // a DocumentFragment.  (This is what innerHTML would do if
  // it were defined on DocumentFragments.)
  DomUtils.fragmentToHtml = function(frag) {
    frag = frag.cloneNode(true); // deep copy, don't touch original!

    return DomUtils.fragmentToContainer(frag).innerHTML;
  };

  // Given a DocumentFragment, return a node whose children are the
  // reparented contents of the DocumentFragment.  In most cases this
  // is as simple as creating a DIV, but in the case of a fragment
  // containing TRs, for example, it's necessary to create a TABLE and
  // a TBODY and return the TBODY.
  DomUtils.fragmentToContainer = function(frag) {
    var doc = document; // node factory

    var firstElement = frag.firstChild;
    while (firstElement && firstElement.nodeType !== 1) {
      firstElement = firstElement.nextSibling;
    }

    var container = doc.createElement("div");

    if (! firstElement) {
      // no tags!
      container.appendChild(frag);
    } else {
      var firstTag = firstElement.nodeName;
      var wrapData = wrapMap[firstTag] || wrapMap._default;

      container.innerHTML = wrapData[1] + wrapData[2];
      var unwraps = wrapData[0];
      while (unwraps--) {
        container = container.lastChild;
      }

      container.appendChild(frag);
    }

    return container;
  };

  // Returns true if element a properly contains element b.
  // Only works on element nodes (e.g. not text nodes).
  DomUtils.elementContains = function(a, b) {
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

  // Returns an array containing the children of contextNode that
  // match `selector`. Unlike querySelectorAll, `selector` is
  // interpreted as if the document were rooted at `contextNode` --
  // the only nodes that can be used to match components of the
  // selector are the descendents of `contextNode`. `contextNode`
  // itself is not included (it can't be used to match a component of
  // the selector, and it can never be included in the returned
  // array.)
  //
  // `contextNode` may be either a node, a document, or a DocumentFragment.
  DomUtils.findAll = function(contextNode, selector) {
    // Eventually, we will remove the dependency on jQuery ($) and
    // implement this in terms of querySelectorAll on modern browsers
    // and Sizzle in old IE.  We'll use jQuery's trick for scoped
    // querySelectorAll which involves temporarily assigning an ID to
    // contextNode (if it doesn't have one) and prepending the ID to
    // the selector.
    if (contextNode.nodeType === 11 /* DocumentFragment */) {
      // Sizzle doesn't work on a DocumentFragment, but it does work on
      // a descendent of one.
      var frag = contextNode;
      var container = DomUtils.fragmentToContainer(frag);
      var results = $(container).find(selector);
      // put nodes back into frag
      while (container.firstChild)
        frag.appendChild(container.firstChild);
      return results;
    } else {
      return $(contextNode).find(selector);
    }
  };

  // Like `findAll` but finds one element (or returns null).
  DomUtils.find = function(contextNode, selector) {
    var results = DomUtils.findAll(contextNode, selector);
    return (results.length ? results[0] : null);
  };

  // Like `findAll` but searches the nodes from `start` to `end`
  // inclusive. `start` and `end` must be siblings, and they participate
  // in the search (they can be used to match selector components, and
  // they can appear in the returned results). It's as if the parent of
  // `start` and `end` serves as contextNode, but matches from children
  // that aren't between `start` and `end` (inclusive) are ignored.
  //
  // If `selector` involves sibling selectors, child index selectors, or
  // the like, the results are undefined.
  //
  // precond: clipStart/clipEnd are descendents of contextNode
  // XXX document
  DomUtils.findAllClipped = function(contextNode, selector, clipStart, clipEnd) {

    // Ensure the clip range starts and ends on element nodes.  This is possible
    // to do without changing the result set because non-element nodes can't
    // be or contain matches.
    while (clipStart !== clipEnd && clipStart.nodeType !== 1)
      clipStart = clipStart.nextSibling;
    while (clipStart !== clipEnd && clipEnd.nodeType !== 1)
      clipEnd = clipEnd.previousSibling;
    if (clipStart.nodeType !== 1)
      return []; // no top-level elements!  start === end and it's not an element

    // resultsPlus includes matches all matches descended from contextNode,
    // including those that aren't in the clip range.
    var resultsPlus = DomUtils.findAll(contextNode, selector);

    // Filter the list of nodes to remove nodes that occur before start
    // or after end.
    return _.reject(resultsPlus, function(n) {
      // reject node if it contains the clip range
      if (DomUtils.elementContains(n, clipStart))
        return true;
      // reject node if (n,start) are in order or (end,n) are in order
      return (DomUtils.elementOrder(n, clipStart) > 0) ||
        (DomUtils.elementOrder(clipEnd, n) > 0);
    });
  };

  // Like `findAllClipped` but finds one element (or returns null).
  DomUtils.findClipped = function(contextNode, selector, clipStart, clipEnd) {
    var results = DomUtils.findAllClipped(contextNode, selector, clipStart, clipEnd);
    return (results.length ? results[0] : null);
  };


  // Returns 0 if the nodes are the same or either one contains the other;
  // otherwise, 1 if a comes before b, or else -1 if b comes before a in
  // document order.
  // Requires: `a` and `b` are element nodes in the same document tree.
  DomUtils.elementOrder = function(a, b) {
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

  // Wrap `frag` as necessary to prepare it for insertion in
  // `container`. For example, if `frag` has TR nodes at top level,
  // and `container` is a TABLE, then it's necessary to wrap `frag` in
  // a TBODY to avoid IE quirks.
  //
  // `frag` is a DocumentFragment and will be modified in
  // place. `container` is a DOM element.
  DomUtils.wrapFragmentForContainer = function(frag, container) {
    if (container && container.nodeName === "TABLE" &&
        _.any(frag.childNodes,
              function(n) { return n.nodeName === "TR"; })) {
      // Avoid putting a TR directly in a TABLE without an
      // intervening TBODY, because it doesn't work in IE.  We do
      // the same thing on all browsers for ease of testing
      // and debugging.
      var tbody = document.createElement("TBODY");
      tbody.appendChild(frag);
      frag.appendChild(tbody);
    }
  };

  // Return true if `node` is part of the global DOM document. Like
  // elementContains(document, node), except (1) it works for any node
  // (eg, text nodes), not just elements; (2) it works around browser
  // quirks that would otherwise come up when passing 'document' as
  // the first argument to elementContains.
  //
  // Returns true if node === document.
  DomUtils.isInDocument = function (node) {
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

    return DomUtils.elementContains(document.body, node);
  };

  // Return an HTML string representation of the nodes from
  // firstNode to lastNode, which must be siblings.
  // The tags representing firstNode and lastNode are included,
  // but not their parent or outer siblings.
  DomUtils.rangeToHtml = function (firstNode, lastNode) {
    var frag = document.createDocumentFragment();
    for(var n = firstNode, after = lastNode.nextSibling;
        n && n !== after;
        n = n.nextSibling)
      frag.appendChild(n.cloneNode(true)); // deep copy
    return DomUtils.fragmentToHtml(frag);
  };

  // Return an HTML string representation of node, including its
  // own open and close tag.
  DomUtils.outerHtml = function (node) {
    return DomUtils.rangeToHtml(node, node);
  };


})();
