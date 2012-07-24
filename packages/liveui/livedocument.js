Meteor.ui = Meteor.ui || {};
Meteor.ui._doc = Meteor.ui._doc || {};

(function() {

  var LIVEUI_START_PREFIX = "LIVEUI_START_";
  var LIVEUI_END_PREFIX = "LIVEUI_END_";
  var LIVEUI_MARKER_PREFIX = "LIVEUI_";
  var HTML_PARSE_REGEX = /<!--LIVEUI_(START|END)_(.*?)-->|<|>|[^<>]+/g;
  var RANGE_PARSE_REGEX = /^<!--LIVEUI_(START|END)_(.*?)-->$/;
  var MARKER_PARSE_REGEX = /^LIVEUI_(.*)$/;

  Meteor.ui._TAG = "_liveui";
  Meteor.ui._HELD = "_liveui_refs"; // XXX _liveui_held

  Meteor.ui._doc._newAnnotations = {}; // {id -> options} until range created
  Meteor.ui._doc._newRanges = []; // [LiveRange, ...] until flush time
  Meteor.ui._doc._nextId = 1;

  // ranges (/annotations) become "live" (range.live) when they go
  // onscreen, and "dead" (range.dead) when they go offscreen.
  // There are onlive and ondead callbacks.  Every range either
  // becomes live and then eventually dead, with both callbacks,
  // or is never externally seen to materialize.  This is determined
  // at flush time.

  // XXX to mention:
  // - turning ranges into frags separately helps deal with
  //   mismatched tags
  // - the LIVEUI_START/END comments could be any strings, in theory,
  //   since we pull them out -- for example, they could be fake
  //   tags like <range> </range>.  Html comments are invisible
  //   if they go through, but not e.g. inside tag attributes.
  // - there is no "ignore annotations" mode, that has to be implemented
  //   in liveui.


  Meteor.ui._doc.materialize = function (html) {
    var idToSubHtml = {};
    var inTag = false;
    var parts = [[]];
    var ids = [];
    _.each(html.match(HTML_PARSE_REGEX), function(tok) {
      var part = tok;
      if (tok === '<') {
        inTag = true;
      } else if (tok === '>') {
        inTag = false;
      } else if (tok.charAt(0) === '<') {
        // START or END comment
        if (inTag) {
          // can't have a "LiveRange" between tag angle brackets;
          // until we deal with this case somehow, ignore
          // the annotation
          part = "";
        } else {
          var match = tok.match(RANGE_PARSE_REGEX);
          var isStart = match[1] === 'START';
          var id = match[2];
          if (isStart) {
            ids.push(id); // push the id we're in
            parts.push([]); // start a new fragment
            part = ""; // don't emit anything
          } else {
            var curId = ids.pop(); // pop the id
            if (curId !== id)
              throw new Error("Range mismatch: "+curId+" / "+id);
            // record the HTML for this range
            var subHtml = parts.pop().join('');
            idToSubHtml[id] = subHtml;
            // emit a comment in the parent range
            part = "<!--" + LIVEUI_MARKER_PREFIX + id + "-->";
          }
        }
      }
      // append the current token to the current fragment
      parts[parts.length - 1].push(part);
    });

    if (ids.length > 0)
      throw new Error("Unclosed ranges "+ids.join(','));

    var topHtml = parts.pop().join('');

    // Helper that invokes `f` on every comment node under `parent`.
    // If `f` returns a node, visit that node next.
    var eachComment = function(parent, f) {
      for (var n = parent.firstChild; n;) {
        if (n.nodeType === 8) { // COMMENT
          n = (f(n) || n.nextSibling);
          continue;
        }
        if (n.nodeType === 1) // ELEMENT
          eachComment(n, f); // recurse
        n = n.nextSibling;
      }
    };

    var makeFrag = function(html) {
      var frag = Meteor.ui._htmlToFragment(html);
      // empty frag becomes HTML comment <!--empty-->
      if (! frag.firstChild)
        frag.appendChild(document.createComment("empty"));

      eachComment(frag, function(comment) {
        var match = MARKER_PARSE_REGEX.exec(comment.nodeValue);
        if (match) {
          var id = match[1];
          var html = idToSubHtml[id];

          // Look up annotation data for this id, to determine if it exists
          // and hasn't been used before during this or a previous
          // materialize (if the dev is not playing by the rules)
          var options = Meteor.ui._doc._newAnnotations[id];
          if (! options)
            throw new Error("Missing or duplicate annotation (on "+
                            (html||'unknown html')+")");
          Meteor.ui._doc._newAnnotations[id] = null;

          var subFrag = makeFrag(html);
          var range = new Meteor.ui._LiveRange(Meteor.ui._TAG, subFrag);
          // assign options to the LiveRange, including `id`
          _.extend(range, options);
          // enqueue the new range for callback processing
          Meteor.ui._doc._newRanges.push(range);

          var next = comment.nextSibling;

          var container = comment.parentNode;
          if (container && container.nodeName === "TABLE" &&
              _.any(subFrag.childNodes,
                    function(n) { return n.nodeName === "TR"; })) {
            // Avoid putting a TR directly in a TABLE without an
            // intervening TBODY, because it doesn't work in IE.  We do
            // the same thing on all browsers for ease of testing
            // and debugging.
            var tbody = document.createElement("TBODY");
            tbody.appendChild(subFrag);
            comment.parentNode.replaceChild(tbody, comment);
          } else {
            comment.parentNode.replaceChild(subFrag, comment);
          }

          return next;
        }
      });

      return frag;
    };

    // at flush time, doCallbacks()
    var cx = new Meteor.deps.Context;
    cx.on_invalidate(Meteor.ui._doc._doCallbacks);
    cx.invalidate();

    return makeFrag(topHtml);
  };

  Meteor.ui._doc.annotate = function(html, options) {
    options = options || {};

    // Generate a unique id string, e.g. "a17"
    var id = "a"+(Meteor.ui._doc._nextId++);
    options.id = id;

    // Save `options` object to attach to LiveRange later
    Meteor.ui._doc._newAnnotations[id] = options;

    // Surround the HTML with comments
    return ("<!--" + LIVEUI_START_PREFIX + options.id + "-->" +
            html + "<!--" + LIVEUI_END_PREFIX + options.id + "-->");
  };

  // possibly GC range, firing synchronous ondead() callbacks
  // for `range` and potentially other ranges if they are
  // currently "live"
  Meteor.ui._doc.touch = function(range) {
    if (range.dead)
      return;

    var node = range.firstNode();
    if (! (node.parentNode &&
           (Meteor.ui._isNodeOnscreen(node) ||
            Meteor.ui._doc._isNodeHeld(node)))) {
      // range is offscreen!
      // kill all ranges in this fragment or detached DOM tree,
      // including `range`
      while (node.parentNode)
        node = node.parentNode;

      Meteor.ui._doc.cleanNodes(node.firstChild, node.lastChild);
    }
  };

  Meteor.ui._doc.cleanNodes = function(start, end) {
    // should accept any (start,end) that the LiveRange constructor does
    var wrapper = new Meteor.ui._LiveRange(Meteor.ui._TAG, start, end);
    wrapper.visit(function (isStart, range) {
      if (isStart && range.live) {
        range.live = false;
        range.dead = true;
        range.ondead && range.ondead();
      }
    });
    wrapper.destroy(true);
  };

  Meteor.ui._doc._doCallbacks = function() {
    _.each(Meteor.ui._doc._newRanges, function(range) {
      Meteor.ui._doc.touch(range);
      if (! range.dead) {
        range.live = true;
        range.onlive && range.onlive();
      }
    });

    Meteor.ui._doc._newAnnotations = {};
    Meteor.ui._doc._newRanges.length = 0;
  };

  // "node holding" is a facility used for unit tests where
  // we don't GC a DocumentFragment at flush time.
  Meteor.ui._doc._isNodeHeld = function(node) {
    while (node.parentNode)
      node = node.parentNode;

    return node.nodeType !== 3 /*TEXT_NODE*/ &&
      node[Meteor.ui._HELD];
  };

})();