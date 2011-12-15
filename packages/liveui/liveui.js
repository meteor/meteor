Sky.ui = Sky.ui || {};

Sky.ui._killtree = function (elt) {
  if (elt._context) {
    elt._context.killed = true;
    elt._context.invalidate();
    delete elt._context;
  }

  for (var i = 0; i < elt.childNodes.length; i++)
    Sky.ui._killtree(elt.childNodes[i]);
};

// from and to should be siblings
// XXX if jquery is present, hook this up to the jquery cleanup system
Sky.ui._killrange = function (from, to) {
  while (true) {
    Sky.ui._killtree(from);
    if (from === to)
      break;
    from = from.nextSibling;
  }
};

// if frag is given, save the removed nodes in it instead of deleting
// them (and don't kill them)
Sky.ui._remove = function (from, to, frag) {
  // could use a Range here (on many browsers) for faster deletes?
  var parent = from.parentNode;
  while (true) {
    var next = from.nextSibling;
    if (frag)
      frag.appendChild(from);
    else {
      Sky.ui._killtree(from);
      parent.removeChild(from);
    }
    if (from === to)
      break;
    if (!next) {
      console.log("Warning: The final element in a live-updating range " +
                  "was removed. This could result in incorrect updates.");
      break;
    }
    from = next;
  }
};

/// OLD COMMENT, REWRITE (XXX):
///
/// Render some HTML, resulting in a DOM node, which is
/// returned. Update that DOM node in place when any of the rendering
/// dependencies change. (The tag name of the node returned from the
/// template mustn't change -- it must not be a function of any
/// dependencies.)
///
/// render_func should return either a single DOM element, or an array
/// of elements. In the latter case, on rerendering, it must still
/// return an array, and the number and tag names of the elements in
/// the array must not change.
///
/// 'events' is optional. if given, takes the same kind of event map
/// as renderLive. If render_func retruns an array, the event map will
/// be applied to each element in the array. If 'event_data' is
/// provided, it will be passed to events when they fire, as their
/// object data agument.
///
/// render() may be called recursively (that is, 'what' can call
/// render.) when this happens, a change to a dependency in the inner
/// render() won't cause the stuff in the outer render() to be
/// re-evaluated, so it serves as a recomputation fence.

Sky.ui.render = function (render_func, events, event_data) {
  var start, end;

  var render_fragment = function (context) {
    var result = context.run(render_func);
    var frag;

    // Coerce to a document fragment
    if (result instanceof DocumentFragment)
      frag = result;
    else if (result instanceof Node) {
      var frag = document.createDocumentFragment();
      frag.appendChild(result);
    } else if (result instanceof Array ||
               ((typeof $ !== "undefined") && (result instanceof $))) {
      var frag = document.createDocumentFragment();
      for (var i = 0; i < result.length; i++)
        frag.appendChild(result[i]);
    } else
      throw new Error("Render functions should return a DocumentFragment, " +
                      "a node, an array of nodes, or a jQuery-style result " +
                      "set.");

    // Attach events
    for (var i = 0; i < frag.childNodes.length; i++)
      Sky.ui._setupEvents(frag.childNodes[i], events || {}, event_data);

    // If empty, add a placeholder
    if (!frag.childNodes.length)
      frag.appendChild(document.createComment("empty rendering"));
    return frag;
  };

  var update = function (old_context) {
    if (old_context) {
      if (old_context.killed)
        return;

      delete start._context;

      if (!(document.body.contains ? document.body.contains(start)
            : (document.body.compareDocumentPosition(start) & 16))) {
        // It was taken offscreen. Stop updating it so it can get GC'd.
        Sky.ui._killrange(start, end);
        return;
      }
    }

    var context = new Sky.deps.Context;
    context.on_invalidate(update);
    var frag = render_fragment(context);

    // if we share 'start' or 'end' with another instance of render,
    // bad things could happen.
    // XXX need name less prone to collide
    if (frag.firstChild._used) {
      console.log("note: wrapping prefix"); // XXX REMOVE
      frag.insertBefore(document.createComment(""), frag.firstChild);
    }
    if (frag.lastChild._used) {
      console.log("note: wrapping suffix"); // XXX REMOVE
      frag.appendChild(document.createComment(""));
    }

    var new_start = frag.firstChild;
    var new_end = frag.lastChild;
    new_start._used = new_end._used = true;
    // XXX need name less prone to collide
    new_start._context = context;

    if (old_context) {
      start.parentNode.insertBefore(frag, start);
      Sky.ui._remove(start, end);
    }

    // XXX remove could trigger blur, which could reasonably call
    // flush, which could reinvoke us. or could it?  what's the deal
    // for flush inside flush?? [consider synthesizing onblur, via
    // settimeout(0)..]

    start = new_start;
    end = new_end;
    return frag;
  };

  return update(null);
};

/// OLD COMMENT, REWRITE (XXX):
///
/// Do a query on 'collection', and replace the children of 'element'
/// with the results.
///
/// If jQuery is present, then 'element' may be a jQuery result set,
/// in which case the first element is used.
///
/// options to include:
///  selector: minimongo selector (default: {})
///  sort: minimongo sort specification (default: natural order)
///  render: render function (as in render(), but takes a document)
/// .. plus optionally
///  render_empty: render function for content to show when query empty.
///   still gets same event bindings.
///  events: vaguely backbone-style live event specification
///    {'click #selector #path' : function (obj) { } }
///
/// returns an object with:
///  stop(): stop updating, tear everything down and let it get GC'd

/// XXX consider making render an argument rather than an option
///
/// XXX what package should this go in? depends on both liveui and minimongo..
///
/// XXX what can now be a collection, or the handle of an existing
/// findlive. messy.
Sky.ui.renderList = function (what, options) {
  var frag = document.createDocumentFragment();
  var context = new Sky.deps.Context;

  var is_handle = what instanceof Collection.LiveResultsSet;
  var name = (is_handle ? what.collection : what)._name;
  var start = document.createComment("renderList " + name);
  var end = document.createComment("end " + name);
  start._used = end._used = true;
  start._context = context;
  frag.appendChild(start);
  frag.appendChild(end);

  var empty_shown = false;
  var entry_starts = [];
  var entry_end = function (idx) {
    return (entry_starts[idx + 1] || end).previousSibling;
  };

  var insert_entry = function (doc, before_idx) {
    var frag = Sky.ui.render(_.bind(options.render, null, doc),
                             options.events || {}, doc);
    var this_start = document.createComment(doc._id);
    frag.insertBefore(this_start, frag.firstChild);
    start.parentNode.insertBefore(frag, entry_starts[before_idx] || end);
    return this_start;
  };

  var maybe_show_empty = function () {
    if (!entry_starts.length && options.render_empty) {
      start.parentNode.insertBefore(
        Sky.ui.render(options.render_empty, options.events), end);
      empty_shown = true;
    }
  };

  var query_opts = {
    added: function (doc, before_idx) {
      if (empty_shown) {
        Sky.ui._remove(start.nextSibling, end.previousSibling);
        empty_shown = false;
      }
      entry_starts.splice(before_idx, 0, insert_entry(doc, before_idx));
    },
    removed: function (id, at_idx) {
      Sky.ui._remove(entry_starts[at_idx], entry_end(at_idx));
      entry_starts.splice(at_idx, 1);
      maybe_show_empty();
    },
    changed: function (doc, at_idx) {
      var this_start = insert_entry(doc, at_idx);
      Sky.ui._remove(entry_starts[at_idx], entry_end(at_idx));
      entry_starts[at_idx] = this_start;
    },
    moved: function (doc, old_idx, new_idx) {
      var this_start = entry_starts[old_idx];
      var frag = document.createDocumentFragment();
      Sky.ui._remove(this_start, entry_end(old_idx), frag);
      start.parentNode.insertBefore(frag, entry_starts[new_idx] || null);
      entry_starts.splice(old_idx, 1);
      entry_starts.splice(new_idx, 0, this_start);
    }
  };

  if (is_handle) {
    var query = what;
    query.reconnect(query_opts);
  } else {
    query_opts.sort = options.sort;
    var query = what.findLive(options.selector || {}, query_opts);
  }
  maybe_show_empty();

  context.on_invalidate(function (old_context) {
    query.stop();

    if (!old_context.killed) {
      delete start._context;
      Sky.ui._killrange(start, end);
    }
  });

  return frag;
};

// XXX jQuery dependency
// 'event_data' will be an additional argument to event callback
Sky.ui._setupEvents = function (elt, events, event_data) {
  events = events || {};
  function create_callback (callback) {
    // return a function that will be used as the jquery event
    // callback, in which "this" is bound to the DOM element bound
    // to the event.
    return function (evt) {
      callback.call(event_data, evt);
    };
  };

  for (spec in events) {
    var clauses = spec.split(/,\s+/);
    _.each(clauses, function (clause) {
      var parts = clause.split(/\s+/);
      if (parts.length === 0)
        return;

      if (parts.length === 1) {
        $(elt).bind(parts[0], create_callback(events[spec]));
      } else {
        var event = parts.splice(0, 1)[0];
        $(elt).delegate(parts.join(' '), event, create_callback(events[spec]));
      }
    });
  }
};
