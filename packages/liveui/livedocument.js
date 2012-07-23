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

  Meteor.ui._doc._newAnnotations = {}; // {id -> options} until range created
  Meteor.ui._doc._newRanges = []; // [LiveRange, ...] until flush time
  Meteor.ui._doc._nextId = 1;

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

})();