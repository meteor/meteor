Meteor.ui = Meteor.ui || {};

(function() {

  // In render mode (i.e. inside Meteor.ui.render), this is an
  // object, otherwise it is null.
  // callbacks: id -> func, where id ranges from 1 to callbacks._count.
  Meteor.ui._render_mode = null;

  // `in_range` is a package-private argument used to render inside
  // an existing LiveRange on an update.
  Meteor.ui.render = function (html_func, react_data, in_range) {
    if (typeof html_func !== "function")
      throw new Error("Meteor.ui.render() requires a function as its first argument.");

    if (Meteor.ui._render_mode)
      throw new Error("Can't nest Meteor.ui.render.");

    var cx = new Meteor.deps.Context;

    Meteor.ui._render_mode = {callbacks: {_count: 0}};
    var html, rangeCallbacks;
    try {
      html = cx.run(html_func); // run the caller's html_func
    } finally {
      rangeCallbacks = Meteor.ui._render_mode.callbacks;
      Meteor.ui._render_mode = null;
    }

    if (typeof html !== "string")
      throw new Error("Render function must return a string");

    var frag = Meteor.ui._htmlToFragment(html);
    if (! frag.firstChild)
      frag.appendChild(document.createComment("empty"));


    // Helper that invokes `f` on every comment node under `parent`.
    // If `f` returns a node, visit that node next.
    var each_comment = function(parent, f) {
      for (var n = parent.firstChild; n;) {
        if (n.nodeType === 8) { // comment
          n = f(n) || n.nextSibling;
          continue;
        } else if (n.nodeType === 1) { // element
          each_comment(n, f);
        }
        n = n.nextSibling;
      }
    };

    // walk comments and create ranges
    var rangeStartNodes = {};
    var rangesCreated = []; // [[range, id], ...]
    each_comment(frag, function(n) {

      var rangeCommentMatch = /^\s*(START|END)RANGE_(\S+)/.exec(n.nodeValue);
      if (! rangeCommentMatch)
        return null;

      var which = rangeCommentMatch[1];
      var id = rangeCommentMatch[2];

      if (which === "START") {
        if (rangeStartNodes[id])
          throw new Error("The return value of chunk can only be used once.");
        rangeStartNodes[id] = n;

        return null;
      }
      // else: which === "END"

      var startNode = rangeStartNodes[id];
      var endNode = n;
      var next = endNode.nextSibling;

      // try to remove comments
      var a = startNode, b = endNode;
      if (a.nextSibling && b.previousSibling) {
        if (a.nextSibling === b) {
          // replace two adjacent comments with one
          endNode = startNode;
          b.parentNode.removeChild(b);
          startNode.nodeValue = 'placeholder';
        } else {
          // remove both comments
          startNode = startNode.nextSibling;
          endNode = endNode.previousSibling;
          a.parentNode.removeChild(a);
          b.parentNode.removeChild(b);
        }
      } else {
        /* shouldn't happen; invalid HTML? */
      }

      if (startNode.parentNode !== endNode.parentNode) {
        // Try to fix messed-up comment ranges like
        // <!-- #1 --><tbody> ... <!-- /#1 --></tbody>,
        // which are extremely common with tables.  Tests
        // fail in all browsers without this code.
        if (startNode === endNode.parentNode ||
            startNode === endNode.parentNode.previousSibling) {
          startNode = endNode.parentNode.firstChild;
        } else if (endNode === startNode.parentNode ||
                   endNode === startNode.parentNode.nextSibling) {
          endNode = startNode.parentNode.lastChild;
        } else {
          var r = new RegExp('<!--\\s*STARTRANGE_'+id+'.*?-->', 'g');
          var match = r.exec(html);
          var help = "";
          if (match) {
            var comment_end = r.lastIndex;
            var comment_start = comment_end - match[0].length;
            var stripped_before = html.slice(0, comment_start).replace(
                /<!--\s*(START|END)RANGE.*?-->/g, '');
            var stripped_after = html.slice(comment_end).replace(
                /<!--\s*(START|END)RANGE.*?-->/g, '');
            var context_amount = 50;
            var context = stripped_before.slice(-context_amount) +
                  stripped_after.slice(0, context_amount);
            help = " (possible unclosed near: "+context+")";
          }
          throw new Error("Could not create liverange in template. "+
                          "Check for unclosed tags in your HTML."+help);
        }
      }

      var range = new Meteor.ui._LiveRange(Meteor.ui._tag, startNode, endNode);
      rangesCreated.push([range, id]);

      return next;
    });


    var range;
    if (in_range) {
      // Called to re-render a chunk; update that chunk in place.
      Meteor.ui._intelligent_replace(in_range, frag);
      range = in_range;
    } else {
      range = new Meteor.ui._LiveRange(Meteor.ui._tag, frag);
    }

    // Call "added to DOM" callbacks to wire up all sub-chunks.
    _.each(rangesCreated, function(x) {
      var range = x[0];
      var id = x[1];
      if (rangeCallbacks[id])
        rangeCallbacks[id](range);
    });

    Meteor.ui._wire_up(cx, range, html_func, react_data);

    return (in_range ? null : frag);

  };

  Meteor.ui.chunk = function(html_func, react_data) {
    if (typeof html_func !== "function")
      throw new Error("Meteor.ui.chunk() requires a function as its first argument.");

    if (! Meteor.ui._render_mode) {
      return html_func();
    }

    var cx = new Meteor.deps.Context;
    var html = cx.run(html_func);

    if (typeof html !== "string")
      throw new Error("Render function must return a string");

    return Meteor.ui._ranged_html(html, function(range) {
      Meteor.ui._wire_up(cx, range, html_func, react_data);
    });
  };


  Meteor.ui.listChunk = function (observable, doc_func, else_func, react_data) {
    if (arguments.length === 3 && typeof else_func === "object") {
      // support (observable, doc_func, react_data) form
      react_data = else_func;
      else_func = null;
    }

    if (typeof doc_func !== "function")
      throw new Error("Meteor.ui.listChunk() requires a function as first argument");
    else_func = (typeof else_func === "function" ? else_func :
                 function() { return ""; });
    react_data = react_data || {};

    var buf = [];
    var receiver = new Meteor.ui._CallbackReceiver();

    var handle = observable.observe(receiver);
    receiver.flush_to_array(buf);

    var inner_html;
    if (buf.length === 0) {
      inner_html = Meteor.ui.chunk(else_func, react_data);
    } else {
      var doc_render = function(doc) {
        return Meteor.ui._ranged_html(
          Meteor.ui.chunk(function() { return doc_func(doc); },
                          _.extend({}, react_data, {event_data: doc})));
      };
      inner_html = _.map(buf, doc_render).join('');
    }

    if (! Meteor.ui._render_mode) {
      handle.stop();
      return inner_html;
    }

    return Meteor.ui._ranged_html(inner_html, function(outer_range) {
      var range_list = [];
      // find immediate sub-ranges of range, and add to range_list
      if (buf.length > 0) {
        outer_range.visit(function(is_start, r) {
          if (is_start)
            range_list.push(r);
          return false;
        });
      }

      Meteor.ui._wire_up_list(outer_range, range_list, receiver, handle,
                              doc_func, else_func, react_data);
    });
  };


  var killContext = function(range) {
    var cx = range.context;
    if (cx && ! cx.killed) {
      cx.killed = true;
      cx.invalidate && cx.invalidate();
      delete range.context;
    }
  };

  Meteor.ui._tag = "_liveui";

  var _checkOffscreen = function(range) {
    var node = range.firstNode();

    if (node.parentNode &&
        (Meteor.ui._onscreen(node) || Meteor.ui._is_held(node)))
      return false;

    cleanup_range(range);

    return true;
  };

  // Internal facility, only used by tests, for holding onto
  // DocumentFragments across flush().  Reference counts
  // using hold() and release().
  Meteor.ui._is_held = function(node) {
    while (node.parentNode)
      node = node.parentNode;

    return node.nodeType !== 3 /*TEXT_NODE*/ && node._liveui_refs;
  };
  Meteor.ui._hold = function(frag) {
    frag._liveui_refs = (frag._liveui_refs || 0) + 1;
  };
  Meteor.ui._release = function(frag) {
    // Clean up on flush, if hits 0.
    // Don't want to decrement
    // _liveui_refs to 0 now because someone else might
    // clean it up if it's not held.
    var cx = new Meteor.deps.Context;
    cx.on_invalidate(function() {
      --frag._liveui_refs;
      if (! frag._liveui_refs)
        cleanup_frag(frag);
    });
    cx.invalidate();
  };

  Meteor.ui._onscreen = function (node) {
    // http://jsperf.com/is-element-in-the-dom

    if (document.compareDocumentPosition)
      return document.compareDocumentPosition(node) & 16;
    else {
      if (node.nodeType !== 1 /* Element */)
        /* contains() doesn't work reliably on non-Elements. Fine on
         Chrome, not so much on Safari and IE. */
        node = node.parentNode;
      if (node.nodeType === 11 /* DocumentFragment */ ||
          node.nodeType === 9 /* Document */)
        /* contains() chokes on DocumentFragments on IE8 */
        return node === document;
      /* contains() exists on document on Chrome, but only on
       document.body on some other browsers. */
      return document.body.contains(node);
    }
  };

  var CallbackReceiver = function() {
    var self = this;

    self.queue = [];
    self.deps = {};

    // attach these callback funcs to each instance, as they may
    // not be called as methods by livedata.
    _.each(["added", "removed", "moved", "changed"], function (name) {
      self[name] = function (/* arguments */) {
        self.queue.push([name].concat(_.toArray(arguments)));
        self.signal();
      };
    });
  };

  Meteor.ui._CallbackReceiver = CallbackReceiver;

  CallbackReceiver.prototype.flush_to = function(t) {
    // fire all queued events on new target
    _.each(this.queue, function(x) {
      var name = x[0];
      var args = x.slice(1);
      t[name].apply(t, args);
    });
    this.queue.length = 0;
  };
  CallbackReceiver.prototype.flush_to_array = function(array) {
    // apply all queued events to array
    _.each(this.queue, function(x) {
      switch (x[0]) {
      case 'added': array.splice(x[2], 0, x[1]); break;
      case 'removed': array.splice(x[2], 1); break;
      case 'moved': array.splice(x[3], 0, array.splice(x[2], 1)[0]); break;
      case 'changed': array[x[2]] = x[1]; break;
      }
    });
    this.queue.length = 0;
  };
  CallbackReceiver.prototype.signal = function() {
    if (this.queue.length > 0) {
      for(var id in this.deps)
        this.deps[id].invalidate();
    }
  };
  CallbackReceiver.prototype.depend = function() {
    var context = Meteor.deps.Context.current;
    if (context && !(context.id in this.deps)) {
      this.deps[context.id] = context;
      var self = this;
      context.on_invalidate(function() {
        delete self.deps[context.id];
      });
    }
  };

  // Performs a replacement by determining which nodes should
  // be preserved and invoking Meteor.ui._Patcher as appropriate.
  Meteor.ui._intelligent_replace = function(tgtRange, srcParent) {

    // Table-body fix:  if tgtRange is in a table and srcParent
    // contains a TR, wrap fragment in a TBODY on all browsers,
    // so that it will display properly in IE.
    if (tgtRange.containerNode().nodeName === "TABLE" &&
        _.any(srcParent.childNodes,
              function(n) { return n.nodeName === "TR"; })) {
      var tbody = document.createElement("TBODY");
      while (srcParent.firstChild)
        tbody.appendChild(srcParent.firstChild);
      srcParent.appendChild(tbody);
    }

    var copyFunc = function(t, s) {
      $(t).unbind(".liveui"); // XXX jQuery dependency
      Meteor.ui._LiveRange.transplant_tag(
        Meteor.ui._tag, t, s);
    };

    //tgtRange.replace_contents(srcParent);

    tgtRange.operate(function(start, end) {
      // clear all LiveRanges on target
      cleanup_range(new Meteor.ui._LiveRange(Meteor.ui._tag, start, end));

      var patcher = new Meteor.ui._Patcher(
        start.parentNode, srcParent,
        start.previousSibling, end.nextSibling);
      patcher.diffpatch(copyFunc);
    });

    attach_secondary_events(tgtRange);
  };

  Meteor.ui._wire_up = function(cx, range, html_func, react_data) {
    // wire events
    var data = react_data || {};
    if (data.events) {
      range.events = data.events;
      range.event_data = data.event_data;
    }

    attach_primary_events(range);

    // record that if we see this range offscreen during a flush,
    // we are to kill the context (mark it killed and invalidate it).
    // Kill old context from previous update.
    killContext(range);
    range.context = cx;

    // wire update
    cx.on_invalidate(function(old_cx) {
      if (old_cx.killed)
        return; // context was invalidated as part of killing it
      if (_checkOffscreen(range))
        return;

      Meteor.ui.render(html_func, react_data, range);
    });
  };

  Meteor.ui._wire_up_list =
    function(outer_range, range_list, receiver, handle_to_stop,
             doc_func, else_func, react_data)
  {
    react_data = react_data || {};

    outer_range.context = new Meteor.deps.Context;
    outer_range.context.run(function() {
      receiver.depend();
    });
    outer_range.context.on_invalidate(function update(old_cx) {
      if (old_cx.killed || _checkOffscreen(outer_range)) {
        if (handle_to_stop)
          handle_to_stop.stop();
        return;
      }

      receiver.flush_to(callbacks);

      Meteor.ui._wire_up_list(outer_range, range_list, receiver,
                              handle_to_stop, doc_func, else_func,
                              react_data);
    });

    var renderItem = function(doc, in_range) {
      return Meteor.ui.render(
          _.bind(doc_func, null, doc),
        _.extend({}, react_data, {event_data: doc}),
        in_range);
    };

    var renderElse = function() {
      return Meteor.ui.render(else_func, react_data);
    };

    var callbacks = {
      added: function(doc, before_idx) {
        var frag = renderItem(doc);
        var range = new Meteor.ui._LiveRange(Meteor.ui._tag, frag);
        if (range_list.length === 0)
          cleanup_frag(outer_range.replace_contents(frag));
        else if (before_idx === range_list.length)
          range_list[range_list.length-1].insert_after(frag);
        else
          range_list[before_idx].insert_before(frag);

        attach_secondary_events(range);

        range_list.splice(before_idx, 0, range);
      },
      removed: function(doc, at_idx) {
        if (range_list.length === 1) {
          cleanup_frag(
            outer_range.replace_contents(renderElse()));
          attach_secondary_events(outer_range);
        } else {
          cleanup_frag(range_list[at_idx].extract());
        }

        range_list.splice(at_idx, 1);
      },
      moved: function(doc, old_idx, new_idx) {
        if (old_idx === new_idx)
          return;

        var range = range_list[old_idx];
        // We know the list has at least two items,
        // at old_idx and new_idx, so `extract` will succeed.
        var frag = range.extract(true);
        range_list.splice(old_idx, 1);

        if (new_idx === range_list.length)
          range_list[range_list.length-1].insert_after(frag);
        else
          range_list[new_idx].insert_before(frag);
        range_list.splice(new_idx, 0, range);
      },
      changed: function(doc, at_idx) {
        var range = range_list[at_idx];

        // replace the render in the immediately nested range
        range.visit(function(is_start, r) {
          if (is_start)
            renderItem(doc, r);
          return false;
        });
      }
    };
  };

  Meteor.ui._ranged_html = function(html, callback) {
    if (! Meteor.ui._render_mode)
      return html;

    var callbacks = Meteor.ui._render_mode.callbacks;

    var commentId = ++callbacks._count;
    callbacks[commentId] = callback;
    return "<!-- STARTRANGE_"+commentId+" -->" + html +
      "<!-- ENDRANGE_"+commentId+" -->";
  };

  var cleanup_frag = function(frag) {
    // wrap the frag in a new LiveRange that will be destroyed
    cleanup_range(new Meteor.ui._LiveRange(Meteor.ui._tag, frag));
  };

  // Cleans up a range and its descendant ranges by calling
  // killContext on them (which removes any associated context
  // from dependency tracking) and then destroy (which removes
  // the liverange data from the DOM).
  var cleanup_range = function(range) {
    range.visit(function(is_start, range) {
      if (is_start)
        killContext(range);
    });
    range.destroy(true);
  };

  // Attach events specified by `range` to top-level nodes in `range`.
  var attach_primary_events = function(range) {
    Meteor.ui._attachEvents(range.firstNode(), range.lastNode(),
                            range.events, range.event_data);
  };

  // Attach events specified by enclosing ranges of `range`, at the
  // same DOM level, to nodes in `range`.  This is necessary if
  // `range` has just been inserted (as in the case of list 'added'
  // events) or if it has been re-rendered but its enclosing ranges
  // haven't.  In either case, the nodes in `range` have been rendered
  // without taking enclosing ranges into account, so additional event
  // handlers need to be attached.
  var attach_secondary_events = function(range) {
    for(var r = range; r; r = r.findParent(true)) {
      if (r === range)
        continue;

      Meteor.ui._attachEvents(range.firstNode(), range.lastNode(),
                              r.events, r.event_data);
    }
  };

  // XXX jQuery dependency
  Meteor.ui._attachEvents = function (start, end, events, event_data) {
    events = events || {};

    // iterate over `spec: callback` map
    _.each(events, function(callback, spec) {
      var clauses = spec.split(/,\s+/);
      _.each(clauses, function (clause) {
        var parts = clause.split(/\s+/);
        if (parts.length === 0)
          return;

        var event = parts.shift();
        var selector = parts.join(' ');

        var after = end.nextSibling;
        for(var n = start; n && n !== after; n = n.nextSibling) {
          // use function scope to close over each node `n`.
          // otherwise, there is only one `n` for all the callbacks!
          (function(bound) {
            $.event.add(n, event+".liveui", function(evt) {
              if (selector) {
                // target must match selector
                var target = evt.target;
                // use element's parentNode as a "context"; any elements
                // referenced in the selector must be proper descendents
                // of the context.
                var results = $(bound.parentNode).find(selector);
                if (! _.contains(results, target))
                  return;
              }
              callback.call(event_data, evt);
            });
          })(n);
        }
      });
    });
  };

})();
