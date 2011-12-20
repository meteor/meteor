Sky.ui = Sky.ui || {};

// Kill/cancel all the subranges of 'range', but not 'range' itself.
Sky.ui._cleanup = function (range) {
  var walk = function (branch) {
    _.each(branch.children, walk);
    if (branch.range.context) {
      branch.range.context.killed = true;
      branch.range.context.invalidate();
    }
    branch.range.destroy(); // help old GC's
  };

  _.each(range.contained().children, walk);
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

    // XXX BUG: If you have a conditional (#if) element at toplevel,
    // will it get its event attached if it comes into existence
    // later? In fact, there are cases eg in AcataGrid where you have
    // to add an extra div to make it work:
    //
    /*
<template name="user_list">
  <div class="user_list">
    {{#each users}}
      {{> user }}
    {{/each}}
  </div>
  <div>               <==== Here is the extra div that's required
    {{#if logged_in}}
      <span class="edit_user action">Edit my information</span>
    {{/if}}
  </div>
</template>
*/

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
      range.destroy();
      return;
    }

    // XXX remove could trigger blur, which could reasonably call
    // flush, which could reinvoke us. or could it?  what's the deal
    // for flush inside flush?? [consider synthesizing onblur, via
    // settimeout(0)..]

    var context = new Sky.deps.Context;
    context.on_invalidate(update);
    var frag = render_fragment(context);
    var removed = range.replace_contents(frag);
    range.context = context;

    var removed_range = new Sky.ui._LiveRange(Sky.ui._tag, removed);
    Sky.ui._cleanup(removed_range);
    removed_range.destroy();
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

/// XXX consider making render an argument rather than an option
///
/// XXX what package should this go in? depends on both liveui and minimongo..
///
/// XXX what can now be a collection, or the handle of an existing
/// findlive. messy.
Sky.ui.renderList = function (what, options) {
  throw new Error("Unimplemented");
  var outer_range;
  var entry_ranges = [];

  var create_outer_range = function (initial_contents) {
    var outer_range = new Sky.ui._LiveRange(Sky.ui._tag, initial_contents);
    outer_range.context = new Sky.deps.Context;

    outer_range.context.on_invalidate(function (old_context) {
      query.stop();

      if (!old_context.killed) {
        Sky.ui._cleanup(outer_range);
        outer_range.destroy();
      }
    });
  };

  var render_doc = function (doc) {
    return Sky.ui.render(_.bind(options.render, null, doc),
                         options.events || {}, doc);
  };

  var render_empty = function () {
    return options.render_empty ?
      Sky.ui.render(options.render_empty, options.events) :
      document.createComment("empty list");
  };

  var query_opts = {
    added: function (doc, before_idx) {
      var frag = render_doc(doc);
      var new_range = new Sky.ui._LiveRange(Sky.ui._tag, frag);

      if (!outer_range)
        create_outer_range(frag);
      else if (!entry_ranges.length) {
        var removed = outer_range.replace_contents(frag);
        Sky.ui._cleanup(removed); // XXX NO, MUST WRAP IN RANGE
      } else {
        if (before_idx < entry_ranges.length)
          entry_ranges[before_idx].insertBefore(new_range);
        else
          entry_ranges[before_idx - 1].insertAfter(new_range);
      }

      entry_ranges.splice(before_idx, 0, new_range);
    },
    removed: function (id, at_idx) {
      if (entry_ranges.length > 1)
        var removed = entry_ranges[at_idx].extract();
      else
        var removed = outer_range.replace_contents(render_empty());
      Sky.ui._cleanup(removed); // XXX NO, MUST WRAP IN RANGE
      entry_ranges[at_idx].destroy();
      entry_ranges.splice(at_idx, 1);
    },
    changed: function (doc, at_idx) {
      var removed = entry_ranges[at_idx].replace_contents(render_doc(doc));
      Sky.ui._cleanup(removed); // XXX NO, MUST WRAP IN RANGE
    },
    moved: function (doc, old_idx, new_idx) {
      if (old_idx === new_idx)
        return;
      // At this point we know the list has at least two elements.
      var range = entry_ranges.splice(old_idx, 1)[0];
      var frag = range.extract();
      if (new_idx === entry_ranges.length)
        range.insertAfter(entry_ranges[new_idx - 1]);
      else
        range.insertBefore(entry_ranges[new_idx]);
      entry_ranges.splice(new_idx, 0, range);
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
