Sky.ui = Sky.ui || {};

// Kill/cancel everything inside 'what', which may be a
// DocumentFragment or a range. In the former case, you must pass the
// the range tag to operate on. In the latter case, the range itself
// will be destroyed along with its subranges.
Sky.ui._cleanup = function (what, tag) {
  if (typeof DocumentFragment !== 'undefined' ?
      what instanceof DocumentFragment : what instanceof HTMLDocument)
    what = new Sky.ui._LiveRange(tag, what.firstChild, what.lastChild);

  var ranges = [];
  what.visit(function (is_start, range) {
    if (is_start)
      ranges.push(range);
  });

  _.each(ranges, function (range) {
    if (range.context) {
      range.context.killed = true;
      range.context.invalidate();
    }
    range.destroy(); // help old GC's
  });
};

Sky.ui._tag = "_liveui"; // XXX XXX

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
  var range;
  // http://stackoverflow.com/questions/384286/javascript-isdom-how-do-you-check-if-a-javascript-object-is-a-dom-object
  var isNode = function (o) {
    return (typeof Node === "object" ? o instanceof Node :
            (typeof o === "object" && typeof o.nodeType === "number" &&
             typeof o.nodeName === "string"));
  };

  var render_fragment = function (context) {
    var result = context.run(render_func);
    var frag;

    // Coerce to a document fragment
    if (typeof DocumentFragment !== 'undefined' ?
        result instanceof DocumentFragment : result instanceof HTMLDocument)
      frag = result;
    else if (isNode(result)) {
      frag = document.createDocumentFragment();
      frag.appendChild(result);
    } else if (result instanceof Array ||
               ((typeof $ !== "undefined") && (result instanceof $))) {
      frag = document.createDocumentFragment();
      for (var i = 0; i < result.length; i++)
        frag.appendChild(result[i]);
    } else
      throw new Error("Render functions should return a DocumentFragment, " +
                      "a node, an array of nodes, or a jQuery-style result " +
                      "set.");

    // Attach events
    // XXX bug: https://app.asana.com/0/159908330244/357591577797
    for (var i = 0; i < frag.childNodes.length; i++)
      Sky.ui._setupEvents(frag.childNodes[i], events || {}, event_data);

    // If empty, add a placeholder
    if (!frag.childNodes.length)
      frag.appendChild(document.createComment("empty rendering"));
    return frag;
  };

  var update = function (old_context) {
    if (old_context.killed)
      return; // _cleanup is killing us

    if (!(document.body.contains ? document.body.contains(range.firstNode())
          : (document.body.compareDocumentPosition(range.lastNode()) & 16))) {
      // It was taken offscreen. Stop updating it so it can get GC'd.
      Sky.ui._cleanup(range);
      return;
    }

    // XXX remove could trigger blur, which could reasonably call
    // flush, which could reinvoke us. or could it?  what's the deal
    // for flush inside flush?? [consider synthesizing onblur, via
    // settimeout(0)..]

    var context = new Sky.deps.Context;
    context.on_invalidate(update);
    Sky.ui._cleanup(range.replace_contents(render_fragment(context)),
                    Sky.ui._tag);
    range.context = context;
  };

  var context = new Sky.deps.Context;
  context.on_invalidate(update);
  var frag = render_fragment(context);
  range = new Sky.ui._LiveRange(Sky.ui._tag, frag);
  range.context = context;

  return frag;
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

/// NOTE: if you pass in a query, we will take responsibility for
/// calling stop() on it! this should change in New Database API.

/// XXX consider making render an argument rather than an option
///
/// XXX what package should this go in? depends on both liveui and minimongo..
///
/// XXX what can now be a collection, or the handle of an existing
/// findlive. messy.
Sky.ui.renderList = function (what, options) {
  var outer_frag;
  var outer_range;
  var entry_ranges = [];

  // create the top-level document fragment/range that will be
  // returned by renderList. called exactly once, ever (and that call
  // will be before renderList returns.) returns nothing, sets
  // outer_(frag, range).
  var create_outer_range = function (initial_contents) {
    outer_frag = initial_contents;
    outer_range = new Sky.ui._LiveRange(Sky.ui._tag, initial_contents);
    outer_range.context = new Sky.deps.Context;

    outer_range.context.on_invalidate(function (old_context) {
      query.stop();

      if (!old_context.killed)
        Sky.ui._cleanup(outer_range);
    });
  };

  // render a database result to a DocumentFragment, and return it
  var render_doc = function (doc) {
    return Sky.ui.render(_.bind(options.render, null, doc),
                         options.events || {}, doc);
  };

  // return the DocumentFragment to show when there are no results
  var render_empty = function () {
    if (options.render_empty)
      return Sky.ui.render(options.render_empty, options.events);
    else {
      var ret = document.createDocumentFragment();
      ret.appendChild(document.createComment("empty list"));
      return ret;
    }
  };

  // XXX in the future, insert_before and extract should be refactored
  // into general-purpose functions and moved into the LiveRange
  // library, and ideally rewritten to manipulate the LiveRange tags
  // directly instead of dancing around with placeholders. but for
  // now, let's just get something working.

  // Return a document fragment containing a single node, an empty
  // comment.
  var placeholder = function () {
    var ret = document.createDocumentFragment();
    ret.appendChild(document.createComment(""));
    return ret;
  };

  // At least one entry currently exists. Wrap the given fragment in a
  // range and insert it just before before_idx (or at the end, if
  // before_idx === entry_ranges.length.)
  var insert_before = function (before_idx, frag) {
    if (!entry_ranges.length)
      throw new Error("insert_before: at least one entry must exist");

    // DIAGRAM
    //
    // O1, O2: old entry 1, old entry 2
    // P: temporary placeholder
    // new: entry being inserted
    //
    // +-      +-      +-          +-
    // | +-    | +-    | +-        | +-
    // | |O1   | |P    | | +-      | |new
    // | +-    | +-    | | |new    | +-
    // |    => |    => | | +-   => |
    // | +-    | +-    | |         | +-
    // | |O2   | |O2   | | +-      | |O1
    // | +-    | +-    | | |O1     | +-
    // |-      +-      | | +-      |
    //                 | +-        | +-
    //                 |           | |O2
    //                 | +-        | +-
    //                 | |O2       +-
    //                 | +-
    //                 +-

    // We are going to perform a maneuver where we split one of the
    // existing entries in half. First, determine which entry to split.
    var at_end = before_idx === entry_ranges.length;
    var split_idx = before_idx - (at_end ? 1 : 0);

    // Pull out its contents by replacing them with a placeholder.
    var old_entry = entry_ranges[split_idx].replace_contents(placeholder());

    // Create ranges around both that old entry, and our new entry.
    var new_range = new Sky.ui._LiveRange(Sky.ui._tag, frag);
    var old_range = new Sky.ui._LiveRange(Sky.ui._tag, old_entry);

    // If inserting at the end, interchange the entries so it's like
    // we're inserting before the end.
    if (at_end) {
      var swap;
      swap = new_range; new_range = old_range; old_range = swap;
      swap = frag; frag = old_entry; old_entry = swap;
    }

    // Now, make a new fragment that is the entry we just removed,
    // side by side with the entry we're inserting, in the correct
    // order.
    var new_contents = document.createDocumentFragment();
    new_contents.appendChild(frag);
    new_contents.appendChild(old_entry);

    // Replace the placeholder with that fragment. Now the right
    // elements are in the DOM in the right order.
    entry_ranges[split_idx].replace_contents(new_contents);

    // Finally, fix up the range pointers. This involves deleting the
    // original range (which now contains the two elements.)
    entry_ranges[split_idx].destroy();
    entry_ranges.splice(split_idx, 1, new_range, old_range);
  };

  // Remove an entry (leaving at least one left.) Return the entry as
  // a fragment. Destroy the entry's range and update entry_ranges. Do
  // not clean up the fragment.
  var extract = function (at_idx) {
    if (entry_ranges.length < 2)
      throw new Error("extract: at least one entry must remain");

    // DIAGRAM
    //
    // O1, O2: old entry 1, old entry 2
    // P: temporary placeholders
    //
    // +-      +-         +-          +-
    // | +-    | +-       | +-        | +-
    // | |O1   | | +-     | | +-      | |O2
    // | +-    | | |O1    | | |P      | +-
    // |    => | | +-  => | | +-   => +-
    // | +-    | |        | |
    // | |O2   | | +-     | | +-
    // | +-    | | |O2    | | |P
    // |-      | | +-     | | +-
    //         | +-       | +-
    //         +-         +-

    // Similar to insert_before, but the other way around: we will
    // merge two entries down to one. Find the first entry to merge.
    var last = at_idx === entry_ranges.length - 1;
    var first_idx = at_idx - (last ? 1 : 0);

    // Make a range surrounding the two entries. This is the only
    // range that will ultimately survive the merge.
    var new_range =
      new Sky.ui._LiveRange(Sky.ui._tag,
                            entry_ranges[first_idx].firstNode(),
                            entry_ranges[first_idx + 1].lastNode(),
                            true /* inner! */);

    // Pull out the entry that will survive by replacing it with a placeholder.
    var keep_frag = entry_ranges[at_idx + (last ? -1 : 1)]
      .replace_contents(placeholder());

    // Also pull out the entry we're removing to the caller.
    var ret = entry_ranges[at_idx].replace_contents(placeholder());

    // Now make the contents of new_range be just the surviving
    // entry. (Discard the returned fragment, which is just the two
    // placeholders.)
    new_range.replace_contents(keep_frag);

    // Finally, delete the old ranges and fix up range pointers.
    entry_ranges[first_idx].destroy();
    entry_ranges[first_idx + 1].destroy();
    entry_ranges.splice(first_idx, 2, new_range);
    return ret;
  };

  var query_opts = {
    added: function (doc, before_idx) {
      var frag = render_doc(doc);

      if (!entry_ranges.length) {
        var new_range = new Sky.ui._LiveRange(Sky.ui._tag, frag);
        if (!outer_range)
          create_outer_range(frag);
        else
          Sky.ui._cleanup(outer_range.replace_contents(frag), Sky.ui._tag);
        entry_ranges = [new_range];
      } else
        insert_before(before_idx, frag);
    },
    removed: function (id, at_idx) {
      if (entry_ranges.length > 1) {
        Sky.ui._cleanup(extract(at_idx), Sky.ui._tag);
      } else {
        Sky.ui._cleanup(outer_range.replace_contents(render_empty()),
                        Sky.ui._tag);
        // _cleanup will already have destroyed entry_ranges[at_idx] for us
        entry_ranges.splice(at_idx, 1);
      }
    },
    changed: function (doc, at_idx) {
      var range = entry_ranges[at_idx];
      Sky.ui._cleanup(range.replace_contents(render_doc(doc)), Sky.ui._tag);
    },
    moved: function (doc, old_idx, new_idx) {
      if (old_idx === new_idx)
        return;
      // At this point we know the list has at least two elements (the
      // ones with indices old_idx and new_idx.) So extract() is legal.
      insert_before(new_idx, extract(old_idx));
    }
  };

  if (what instanceof Collection.LiveResultsSet) {
    var query = what;
    query.reconnect(query_opts);
  } else {
    query_opts.sort = options.sort;
    var query = what.findLive(options.selector || {}, query_opts);
  }

  if (!outer_range)
    create_outer_range(render_empty());

  return outer_frag;
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
        $(elt).delegate(parts.join(' '), event, create_callback(events[spec]));
      }
    });
  }
};
