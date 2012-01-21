Meteor.ui = Meteor.ui || {};

// Kill/cancel everything inside 'what', which may be a
// DocumentFragment or a range. In the former case, you must pass the
// the range tag to operate on. In the latter case, the range itself
// will be destroyed along with its subranges.
Meteor.ui._cleanup = function (what, tag) {
  var ranges = [];

  if (typeof what === 'object' && what.nodeType === 11 /* DocumentFragment */)
    what = new Meteor.ui._LiveRange(tag, what.firstChild, what.lastChild);
  else
    ranges.push(what);

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

Meteor.ui._tag = "_liveui"; // XXX XXX

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

/// Unites LiveRange and invalidation contexts. Takes a function that
/// returns a DocumentFragment (or similar), and returns an
/// auto-updating DocumentFragment, by (1) running the function inside
/// an invalidation context, (2) creating a LiveRange around the
/// resulting fragment so that we can track where it goes, (3) wiring
/// up the invalidation handler on the context to re-run the render
/// function and update the fragment in place, whenever it's gone.
///
/// Exact GC semantics are as follows.
/// - Slow path: If we go to do an update, and it's offscreen, we
///   forget it (tear down the auto-updating machinery) so it can get
///   GC'd. This can only happen during Meteor.flush().
///
/// - Fast path: When render and renderList take nodes off the screen
///   due to a rerender, they traverse them to find any auto-updating
///   ranges inside of them and tear them down immediately, without
///   waiting for a flush. This isn't documented (the documentation
///   says that auto-updating can only stop when elements are
///   offscreen during a flush.) We should probably change the
///   implementation, not the documentation. It is a simple change but
///   a lot of tests will need updates.
///   https://app.asana.com/0/159908330244/382690197728
Meteor.ui.render = function (render_func, events, event_data) {
  var range;

  var render_fragment = function (context) {
    var result = context.run(render_func);
    var frag;

    // Coerce to a document fragment

    if (typeof result === "string") {
      result = document.createTextNode(result);
    }

    if (typeof result === 'object' && result.nodeType === 11) {
      /* already a DocumentFragment */
      frag = result;
    } else if (typeof result === 'object' && result.nodeType) {
      /* probably some other Node */
      frag = document.createDocumentFragment();
      frag.appendChild(result);
    } else if (result instanceof Array ||
               ((typeof $ !== "undefined") && (result instanceof $))) {
      frag = document.createDocumentFragment();
      for (var i = 0; i < result.length; i++)
        frag.appendChild(result[i]);
    } else {
      throw new Error("Render functions should return a DocumentFragment, " +
                      "a node, a string, an array of nodes, or a " +
                      "jQuery-style result set");
    }

    // Attach events
    // XXX bug: https://app.asana.com/0/159908330244/357591577797
    for (var i = 0; i < frag.childNodes.length; i++)
      Meteor.ui._setupEvents(frag.childNodes[i], events || {}, event_data);

    // If empty, add a placeholder
    if (!frag.childNodes.length)
      frag.appendChild(document.createComment("empty rendering"));
    return frag;
  };

  var update = function (old_context) {
    if (old_context.killed)
      return; // _cleanup is killing us

    if (!Meteor.ui._onscreen(range.firstNode())) {
      // It was taken offscreen. Stop updating it so it can get GC'd.
      Meteor.ui._cleanup(range);
      return;
    }

    // XXX remove could trigger blur, which could reasonably call
    // flush, which could reinvoke us. or could it?  what's the deal
    // for flush inside flush?? [consider synthesizing onblur, via
    // settimeout(0)..]
    // https://app.asana.com/0/159908330244/385138233856

    var context = new Meteor.deps.Context;
    context.on_invalidate(update);
    Meteor.ui._cleanup(range.replace_contents(render_fragment(context)),
                       Meteor.ui._tag);
    range.context = context;
  };

  var context = new Meteor.deps.Context;
  context.on_invalidate(update);
  var frag = render_fragment(context);
  range = new Meteor.ui._LiveRange(Meteor.ui._tag, frag);
  range.context = context;

  return frag;
};

/// Unites LiveRange, invaldiation contexts, and database queries
/// (specific to mongo at the moment, but will be generalized
/// eventually.)
///
/// Undocumented elsewhere: you may pass in a findLive handle instead
/// of 'what'. In that case, we will use that query instead, and we
/// will take responsibility for calling stop() on it! Let's leave
/// undocumented for now, and document when the new database API
/// lands.
///
/// Exact GC semantics:
/// - Slow path: When a database change happens, unconditionally
///   update the rendering, but also schedule an onscreen check to
///   happen at the next flush(). If at flush() time we're not
///   onscreen, stop updating (and tear down the database query.)
///
/// - Fast path: When taken off the screen by (a containing) render or
///   renderList, then schedule teardown to unconditionally happen at
///   the next flush(). (Database-callback-driven updates will still
///   happen until then.) As with render, should probably change this
///   to only do the teardown if it is in fact still offscreen at
///   flush()-time.
///   https://app.asana.com/0/159908330244/382690197728
Meteor.ui.renderList = function (what, options) {
  var outer_frag;
  var outer_range;
  var entry_ranges = [];

  // create the top-level document fragment/range that will be
  // returned by renderList. called exactly once, ever (and that call
  // will be before renderList returns.) returns nothing, sets
  // outer_(frag, range).
  var create_outer_range = function (initial_contents) {
    outer_frag = initial_contents;
    outer_range = new Meteor.ui._LiveRange(Meteor.ui._tag, initial_contents);
    outer_range.context = new Meteor.deps.Context;

    var try_cleanup = function (old_context) {
      var node = outer_range && outer_range.firstNode();
      if (!old_context.killed && node && Meteor.ui._onscreen(node)) {
        // False alarm -- still onscreen. Could happen if a renderList
        // is initiated, then callbacks happen, then the renderList is
        // put on the screen, then flush is called.
        outer_range.context = new Meteor.deps.Context;
        outer_range.context.on_invalidate(try_cleanup);
        return;
      }

      query.stop();
      if (!old_context.killed)
        Meteor.ui._cleanup(outer_range);
    };

    outer_range.context.on_invalidate(try_cleanup);
  };

  // render a database result to a DocumentFragment, and return it
  var render_doc = function (doc) {
    return Meteor.ui.render(_.bind(options.render, null, doc),
                            options.events || {}, doc);
  };

  // return the DocumentFragment to show when there are no results
  var render_empty = function () {
    if (options.render_empty)
      return Meteor.ui.render(options.render_empty, options.events);
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
    var new_range = new Meteor.ui._LiveRange(Meteor.ui._tag, frag);
    var old_range = new Meteor.ui._LiveRange(Meteor.ui._tag, old_entry);

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
      new Meteor.ui._LiveRange(Meteor.ui._tag,
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

  var check_onscreen = function () {
    var node = outer_range && outer_range.firstNode();
    if (node && !Meteor.ui._onscreen(node))
      // Schedule a check at flush()-time to see if we're still off
      // the screen. (The user has from when we're created, to when
      // flush() is called, to put us on the screen.)
      outer_range.context.invalidate();
  }

  var query_opts = {
    added: function (doc, before_idx) {
      check_onscreen();
      var frag = render_doc(doc);

      if (!entry_ranges.length) {
        var new_range = new Meteor.ui._LiveRange(Meteor.ui._tag, frag);
        if (!outer_range) {
          create_outer_range(frag);
        } else {
          Meteor.ui._cleanup(outer_range.replace_contents(frag), Meteor.ui._tag);
        }
        entry_ranges = [new_range];
      } else {
        insert_before(before_idx, frag);
      }
    },
    removed: function (id, at_idx) {
      check_onscreen();
      if (entry_ranges.length > 1) {
        Meteor.ui._cleanup(extract(at_idx), Meteor.ui._tag);
      } else {
        Meteor.ui._cleanup(outer_range.replace_contents(render_empty()),
                           Meteor.ui._tag);
        // _cleanup will already have destroyed entry_ranges[at_idx] for us
        entry_ranges.splice(at_idx, 1);
      }
    },
    changed: function (doc, at_idx) {
      check_onscreen();
      var range = entry_ranges[at_idx];
      var frag = render_doc(doc);
      Meteor.ui._cleanup(range.replace_contents(frag), Meteor.ui._tag);
    },
    moved: function (doc, old_idx, new_idx) {
      check_onscreen();
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
        $(elt).delegate(parts.join(' '), event, create_callback(events[spec]));
      }
    });
  }
};
