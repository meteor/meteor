if (typeof Meteor === "undefined") Meteor = {};

// XXX ugly hack. provides Meteor._def_template, which is used to load in
// compiled templates.

// XXX disgusting hack. we want to allow Template.foo to be used as a
// Handlebars partial. uh oh -- Handlebars does templating in the
// realm of strings, but Template.foo returns a DOM object (it must,
// for event handlers to work properly). so, for now, we make the
// partial render as an empty div and fix it up later. this probably
// doesn't work in some cases, such as inside a table or ul, where
// divs don't go. this also breaks the ability to have a partial that
// isn't a single DOM element (eg, a partial that is a set of
// attributes, or a text string to be included inside an attribute..)

// XXX it'd be nice to do a better job of hiding these symbols
Meteor._pending_partials = null; // id -> element
Meteor._pending_partials_idx_nonce = 0;

// XXX another messy hack -- we reach into handlebars and extend #each
// to know how to cooperate with pending_partials and minimongo
// findlive.
Meteor._hook_handlebars_each = function () {
  Meteor._hook_handlebars_each = function(){}; // install the hook only once

  var orig = Handlebars._default_helpers.each;
  Handlebars._default_helpers.each = function (context, options) {
    if (!(context instanceof Collection.LiveResultsSet))
      return orig(context, options);

    var id = Meteor._pending_partials_idx_nonce++;
    Meteor._pending_partials[id] = Meteor.ui.renderList(context, {
      render: Meteor._def_template(null, options.fn),
      render_empty: Meteor._def_template(null, _.bind(options.inverse, null, {}))
    });

    return "<!-- TEMPLATE_REPLACE_"+id+" for findlive each -->";
  };
};

// XXX namespacing
Meteor._partials = {};

// XXX hack: name may be null, in which case nothing is put in
// Template, there is no way to define events/data functions, and
// the finished template function (that would otherwise be put in
// Template) is returned. this is a hack that is used for <body>
// templates.
Meteor._def_template = function (name, raw_func) {
  Meteor._hook_handlebars_each();
  window.Template = window.Template || {};
  var cooked_func = function (data) {
    var in_partial = !!Meteor._pending_partials;
    if (!in_partial)
      Meteor._pending_partials = {};

    // XXX it'd be really nice to wrap this in try..catch, because we
    // need to clear _pending_partials or templates won't work
    // anymore! but, it sucks to lose the original stack trace (by
    // rethrowing the exception.) what to do? maybe save off the stack
    // before rethrowing the exception, and somehow make it available
    // to the user?
//    try {
      var html = raw_func(data, {
        helpers: name ? Template[name] : {},
        partials: Meteor._partials
      });
/*    } catch (e) {
      if (!in_partial)
        Meteor._pending_partials = null;
      throw e;
    } */


    var frag = Meteor.makeFrag(html);

    if (!in_partial) {
      var traverse = function (elt) {
        for (var i = 0; i < elt.childNodes.length; i++) {
          var child = elt.childNodes[i];
          var idMatchResult =
                (child.nodeType == 8 /*comment*/ &&
                 /^\s*TEMPLATE_REPLACE_(\S+)/.exec(child.nodeValue));
          var childId = idMatchResult && idMatchResult[1];
          var replacement = Meteor._pending_partials[childId];
          if (replacement) {
            var range = new Meteor.ui._LiveRange(Meteor.ui._tag, child);
            range.replace_contents(replacement);
            range.destroy();
            delete Meteor._pending_partials[childId];
            i--;
            continue;
          }
          traverse(child);
        }
      };

      traverse(frag);

      for (var id in Meteor._pending_partials)
        throw new Error("internal error -- not all pending partials patched");
      Meteor._pending_partials = null;
    }

    return frag;
  };

  var func = function (data) {
    return Meteor.ui.render(_.bind(cooked_func, null, data),
                            name && Template[name].events || {}, data);
  };

  if (name) {
    if (Template[name])
      throw new Error("There are multiple templates named '" + name +
                      "'. Each template needs a unique name.");

    Template[name] = func;

    // XXX hack.. copy all of Handlebars' built in helpers over to
    // Template.foo. it would be better to hook helperMissing (or
    // something like that?) so that Template.foo is searched only
    // if it's not a built-in helper.
    _.extend(Template[name], Handlebars.helpers);
  }

  // XXX hacky. sucks that we have to depend on handlebars here.
  if (name) {
    Meteor._partials[name] = function (data) {
      if (!Meteor._pending_partials)
        // XXX lame error
        throw new Error("this partial may only be invoked from inside a Template.foo-style template");
      var frag = func(data);
      var id = Meteor._pending_partials_idx_nonce++;
      Meteor._pending_partials[id] = frag;
      return "<!-- TEMPLATE_REPLACE_"+id+" for partial -->";
    };
  }

  if (!name)
    return func;
};

// Adapted from jquery html() and "clean".
Meteor.makeFrag = (function() {

  // --- One-time set-up:

  var testDiv = document.createElement("div");
  testDiv.innerHTML = "   <link/><table></table>";

  // Tests that, if true, indicate browser quirks present.
  var quirks = {
    // IE loses initial whitespace when setting innerHTML.
    leadingWhitespaceKilled: (testDiv.firstChild.nodeType !== 3),

    // IE may insert an empty tbody tag in a table.
    tbodyInserted: testDiv.getElementsByTagName("tbody").length > 0,

    // IE loses some tags in some environments (requiring extra wrapper).
    tagsLost: testDiv.getElementsByTagName("link").length == 0
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

  // string -> DocumentFragment
  return function(html) {
    var doc = document; // used for node creation
    var frag = doc.createDocumentFragment();

    if (! rhtml.test(html)) {
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

      var parent = doc.createElement("div");
      // insert wrapped HTML into a DIV
      parent.innerHTML = wrapData[1] + html + wrapData[2];
      // move "parent" inside wrapper
      var unwraps = wrapData[0];
      while (unwraps--) {
        parent = parent.lastChild;
      }

      if (quirks.tbodyInserted && ! rtbody.test(html)) {
        // Any tbody we find was created by the browser.
        var tbodies = parent.getElementsByTagName("tbody");
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
          parent.insertBefore(doc.createTextNode(wsMatch[0]), parent.firstChild);
        }
      }

      // Reparent children of "parent" to frag.
      while (parent.firstChild)
        frag.appendChild(parent.firstChild);
    }

    return frag;
  };
})();

