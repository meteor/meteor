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
      var next = null;

      // XXX use match instead of replace to clarify

      n.nodeValue.replace(/^\s*(START|END)RANGE_(\S+)/, function(z, which, id) {
        if (which === "START") {
          if (rangeStartNodes[id])
            throw new Error("The return value of chunk can only be used once.");
          rangeStartNodes[id] = n;
        } else if (which === "END") {
          var startNode = rangeStartNodes[id], endNode = n;

          next = endNode.nextSibling;
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

          var range = new Meteor.ui._LiveUIRange(startNode, endNode);
          rangesCreated.push([range, id]);
        }
      });

      return next;
    });


    var range;
    if (in_range) {
      // Called to re-render a chunk; update that chunk in place.
      Meteor.ui._intelligent_replace(in_range, frag);
      range = in_range;
    } else {
      range = new Meteor.ui._LiveUIRange(frag);
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


  // define a subclass of _LiveRange with our tag and a finalize method
  Meteor.ui._LiveUIRange = function(start, end, inner) {
    Meteor.ui._LiveRange.call(this, Meteor.ui._LiveUIRange.tag,
                              start, end, inner);
  };
  Meteor.ui._LiveUIRange.prototype = new (
    _.extend(function() {}, {prototype: Meteor.ui._LiveRange.prototype}));
  Meteor.ui._LiveUIRange.prototype.finalize = function() {
    this.killContext();
  };
  Meteor.ui._LiveUIRange.prototype.killContext = function() {
    var cx = this.context;
    if (cx && ! cx.killed) {
      cx.killed = true;
      cx.invalidate && cx.invalidate();
      delete this.context;
    }
  };
  Meteor.ui._LiveUIRange.tag = "_liveui";

  var _checkOffscreen = function(range) {
    var node = range.firstNode();

    if (node.parentNode &&
        (Meteor.ui._onscreen(node) || Meteor.ui._is_held(node)))
      return false;

    range.destroy(true);

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
        cleanup(frag);
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

  // XXX jQuery dependency
  // 'event_data' will be an additional argument to event callback
  Meteor.ui._setupEvents = function (elt, events, event_data) {
    events = events || {};
    function create_callback (callback) {
      // return a function that will be used as the jquery event
      // callback, in which "this" is bound to the DOM element bound
      // to the event.
      return function (evt) {
        callback.call(event_data, evt);
      };
    };

    for (var spec in events) {
      var clauses = spec.split(/,\s+/);
      _.each(clauses, function (clause) {
        var parts = clause.split(/\s+/);
        if (parts.length === 0)
          return;

        if (parts.length === 1) {
          $(elt).bind(parts[0], create_callback(events[spec]));
        } else {
          var event = parts.shift();
          var selector = parts.join(' ');
          var callback = create_callback(events[spec]);
          $(elt).delegate(selector, event, callback);
        }
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
      $(t).unbind(); // XXX remove jquery events from node
      tgtRange.transplant_tag(t, s);
    };

    //tgtRange.replace_contents(srcParent);

    tgtRange.replace_contents(function(start, end) {
      // clear all LiveRanges on target
      (new Meteor.ui._LiveUIRange(start, end)).destroy(true);

      // remove event handlers on old nodes (which we will be patching)
      // at top level, where they are attached by $(...).delegate().
      for(var n = start;
          n && n !== end.nextSibling;
          n = n.nextSibling)
        $(n).unbind();

      var patcher = new Meteor.ui._Patcher(
        start.parentNode, srcParent,
        start.previousSibling, end.nextSibling);
      patcher.diffpatch(copyFunc);
    });

  };

  Meteor.ui._wire_up = function(cx, range, html_func, react_data) {
    // wire events
    var data = react_data || {};
    if (data.events) {
      for(var n = range.firstNode();
          n && n.previousSibling !== range.lastNode();
          n = n.nextSibling) {
        Meteor.ui._setupEvents(n, data.events, data.event_data);
      }
    }

    // record that if we see this range offscreen during a flush,
    // we are to kill the context (mark it killed and invalidate it).
    // Kill old context from previous update.
    range.killContext();
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

    var makeItem = function(doc, in_range) {
      return Meteor.ui.render(
          _.bind(doc_func, null, doc),
        _.extend({}, react_data, {event_data: doc}),
        in_range);
    };

    var callbacks = {
      added: function(doc, before_idx) {
        var frag = makeItem(doc);
        var range = new Meteor.ui._LiveUIRange(frag);
        if (range_list.length === 0)
          cleanup(outer_range.replace_contents(frag));
        else if (before_idx === range_list.length)
          range_list[range_list.length-1].insert_after(frag);
        else
          range_list[before_idx].insert_before(frag);

        range_list.splice(before_idx, 0, range);
      },
      removed: function(doc, at_idx) {
        if (range_list.length === 1)
          cleanup(
            outer_range.replace_contents(Meteor.ui.render(
              else_func, react_data)));
        else
          cleanup(range_list[at_idx].extract());

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
            makeItem(doc, r);
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


  var cleanup = function(frag) {
    (new Meteor.ui._LiveUIRange(frag)).destroy(true);
  };
})();
