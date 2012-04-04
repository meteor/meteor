Meteor.ui = Meteor.ui || {};

// Define Meteor.ui._htmlToFragment and Meteor.ui._fragmentToHtml.
// Adapted from jquery's html() and "clean" routines.
//
// _fragmentToHtml is only used in test code and could be moved
// into a non-core package.
_.extend(Meteor.ui, (function() {

  // --- One-time set-up:

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


  return {
    _htmlToFragment: function(html) {
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
    },
    _fragmentToHtml: function(frag) {
      frag = frag.cloneNode(true); // deep copy, don't touch original!

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

      return container.innerHTML;
    }
  };
})());

