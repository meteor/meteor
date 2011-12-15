Sky.ui = Sky.ui || {};

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

  var kill = function (elt) {
    // (only works if the element is offscreen, because invalidate
    // will just rerender the element unless the containment check
    // fails)

    for (var i = 0; i < elt.childNodes.length; i++) {
      var ch = elt.childNodes[i];

      if (ch._context) {
        // A live-updating range is indicated in the DOM by an element
        // with a _context expando (pointing at an invalidation
        // context), followed eventually by a sibling (maybe even the
        // same node) with an _end expando, marking the end of the
        // range. When we encounter such a range, instead of
        // traversing it, we invalidate the context. It's then
        // responsible for traversing its own children.
        ch._context.invalidate();
        while (i < elt.childNodes.length && elt.childNodes[i]._end)
          i++;
      } else
        kill(elt.childNodes[i]);
    }

    if (elt._context) {
      elt._context.invalidate();
      delete elt._context;
    }
    for (var i = 0; i < elt.childNodes.length; i++)
      kill(elt.childNodes[i]);
  };

  var update = function () {
    delete start._context;

    var onscreen =
      document.body.contains ? document.body.contains(start)
      : (document.body.compareDocumentPosition(start) & 16);
    if (!onscreen) {
      // It was taken offscreen. Stop updating it so it can get GC'd.
      while (true) {
        kill(start);
        if (start === end)
          break;
        start = start.nextSibling;
      };
      return;
    }

    var context = new Sky.deps.Context;
    context.on_invalidate(update);
    var frag = render_fragment(context);
    var new_start = frag.firstChild;
    var new_end = frag.lastChild;

    var container = start.parentNode;
    container.insertBefore(frag, start);
    // could use a Range here (on many browsers) for faster deletes?
    while (true) {
      var next = start.nextSibling;
      container.removeChild(start);
      kill(start);
      if (start === end)
        break;
      if (!next) {
        console.log("Warning: The final element in a live-updating range " +
                    "was removed. This could result in incorrect updates.");
        break;
      }
      start = next;
    }

    // XXX remove could trigger blur, which could reasonably call
    // flush, which could reinvoke us. or could it?  what's the deal
    // for flush inside flush?? [consider synthesizing onblur, via
    // settimeout(0)..]

    start = new_start;
    end = new_end;
    // XXX need names less prone to collide
    if (start._context)
      // bleh. could be render() returning the result of another
      // render(), without wrapping it in a container
      throw new Error("Hit an implementation limitation");
    start._context = context;
    end._end = true;
  };

  return (function () {
    // run in an anonymous function to keep these vars out of update's
    // closure
    var context = new Sky.deps.Context;
    context.on_invalidate(update);
    var frag = render_fragment(context);
    start = frag.firstChild;
    end = frag.lastChild;
    // XXX code duplication
    if (start._context)
      // bleh. could be render() returning the result of another
      // render(), without wrapping it in a container
      throw new Error("Hit an implementation limitation");
    start._context = context;
    end._end = true;
    return frag;
  })();
};







/// Do a query on 'collection', and replace the children of 'element'
/// with the results.
///
/// If jQuery is present, then 'element' may be a jQuery result set,
/// in which case the first element is used.
///
/// options to include:
///  selector: minimongo selector (default: {})
///  sort: minimongo sort specification (default: natural order)
///  render: render function (from object to element)
/// .. plus optionally
///  events: vaguely backbone-style live event specification
///    {'click #selector #path' : function (obj) { } }
///
/// returns an object with:
///  stop(): stop updating, tear everything down and let it get GC'd
///
/// XXX rewrite using Sky.ui.render, and new GC semantics, and make it
/// return a fragment rather than plopping its results into a
/// container
Sky.ui.renderList = function (collection, element, options) {
  if ((typeof $ !== "undefined") && (element instanceof $))
    // allow element to be a jQuery result set
    element = element[0];
  var dead = false;

  var changed = function (obj, at_idx) {
    if (dead)
      return;
    var rendered = render(obj);
    element.insertBefore(rendered, element.children[at_idx]);
    element.removeChild(element.children[at_idx + 1]);
  };

  var render = function (obj) {
    var context = new Sky.deps.Context();

    context.on_invalidate(function () {
      var idx = query.indexOf(obj._id);
      if (idx !== -1) {
        element.insertBefore(render(obj), element.children[idx]);
        element.removeChild(element.children[idx + 1]);
      }
      // if idx === -1, then the liveQuery remove handler will have
      // taken care of removing the rendered element
    });

    var elt = context.run(function () {
      return options.render(obj);
    });

    Sky.ui._setupEvents(elt, options.events || {}, obj);
    return elt;
  };

  while (element.childNodes.length > 0)
    element.removeChild(element.childNodes[0]);

  // XXX duplicated in sky_client.js (hook_handlebars_each)
  var query = collection.findLive(options.selector, {
    added: function (obj, before_idx) {
      if (before_idx === element.childNodes.length)
        element.appendChild(render(obj));
      else
        element.insertBefore(render(obj), element.childNodes[before_idx])
    },
    removed: function (id, at_idx) {
      element.removeChild(element.childNodes[at_idx]);
    },
    changed: function (obj, at_idx) {
      element.insertBefore(render(obj), element.childNodes[at_idx]);
      element.removeChild(element.childNodes[at_idx + 1]);
    },
    moved: function (obj, old_idx, new_idx) {
      var elt = element.removeChild(element.childNodes[old_idx]);
      if (new_idx === element.childNodes.length)
        element.appendChild(elt);
      else
        element.insertBefore(elt, element.childNodes[new_idx]);
    },
    sort: options.sort
  });

  return {
    stop: function() {
      // XXX this has terrible GC semantics. we don't get to tear
      // everything down until each monitor block experiences its
      // callback. actually there are probably a ton of bad GC issues;
      // I haven't thought about it.
      //
      // XXX this is now totally avoidable with the new context
      // api. need to keep an array of contexts, one for each child,
      // and invalidate them all. probably need to rewrite function.
      //
      // XXX more generally, this pattern where the caller has to call
      // stop() is going to result in tears. more likely, we want to
      // detect when we're taken out of the DOM somehow (like jQuery
      // does?) (or maybe even by polling the DOM every few seconds??)
      // and tear everything down automatically.
      dead = true;
      query.stop();
    }
  };
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
