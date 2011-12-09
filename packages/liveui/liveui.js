Sky.ui = Sky.ui || {};

// update in place by hollowing out old element(s), and copying
// over all of the children and attributes. unfortunately there
// is no way to change the tag name. leave the events in place.
Sky.ui._patch = function (old_elt_in, new_elt_in) {
  // Don't let more than one instance of patch run simultaneously.
  // http://code.google.com/p/chromium/issues/detail?id=104397
  //
  // XXX this is a pretty lame solution. Normally users see
  // their changes to Session, the database, etc, reflected in
  // the DOM immediately.. except if, somewhere above them on
  // the stack, is a onblur handler triggered by patch, in which
  // case updates are queued up?? That makes no kind of sense.
  var already_in_patch = !!Sky.ui._patch_queue;
  if (!already_in_patch)
    Sky.ui._patch_queue = [];
  Sky.ui._patch_queue.push([old_elt_in, new_elt_in])
  if (already_in_patch)
    return;

  while (Sky.ui._patch_queue.length) {
    var x = Sky.ui._patch_queue.splice(0, 10)[0];
    var old_elt = x[0];
    var new_elt = x[1];

    if (old_elt.nodeType !== new_elt.nodeType)
      throw new Error("The top-level element type can't change when " +
                      "an element is rerendered (changed from type " +
                      old_elt.nodeType + " to " + new_elt.nodeType + ")");
    if (old_elt.nodeType === 3) { // text node
      old_elt.nodeValue = new_elt.nodeValue;
      return;
    }
    if (old_elt.tagName !== new_elt.tagName)
      throw new Error("The top-level element type can't change when " +
                      "an element is rerendered (changed from " +
                      old_elt.tagName + " to " + new_elt.tagName + ")");
    while (old_elt.childNodes.length)
      old_elt.removeChild(old_elt.childNodes[0]);
    while (new_elt.childNodes.length)
      old_elt.appendChild(new_elt.childNodes[0]);
    while (old_elt.attributes.length)
      old_elt.removeAttribute(old_elt.attributes[0].name);
    for (var i = 0; i < new_elt.attributes.length; i++)
      old_elt.setAttribute(new_elt.attributes[i].name,
                           new_elt.attributes[i].value);
  };

  delete Sky.ui._patch_queue;
};


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
///
/// XXX refactor renderList to make it use this?
/// XXX need to provide a way to stop the updating and let GC happen!!!
Sky.ui.render = function (render_func, events, event_data) {
  var result = null;
  var update = function () {
    var new_result = Sky.deps.monitor(render_func, update);
    if (result === null) {
      result = new_result;
      if (result instanceof Array)
        _.each(result, function (elt) {
          Sky.ui._setupEvents(elt, events || {}, event_data);
        });
      else
        Sky.ui._setupEvents(result, events || {}, event_data);
    } else {
      if ((new_result instanceof Array) !==
          (result instanceof Array))
        throw new Error("A template function can't change from returning an " +
                        "array to returning a single element (or vice versa)");
      if (new_result instanceof Array) {
        if (new_result.length !== result.length)
          throw new Error("A template function can't change the number of " +
                          "elements it returns (from " + result.length +
                          " to " + new_result.length + ")");
        for (var i = 0; i < result.length; i++)
          Sky.ui._patch(result[i], new_result[i]);
      } else
        Sky.ui._patch(result, new_result);
    }
  };

  update();
  return result;
};

/// Do a query on 'collection', and replace the children of 'element'
/// with the results.
///
/// If jQuery is present, then 'element' may be a jQuery result set,
/// in which case the first element is used.
///
/// options to include:
///  query: minimongo selector (default: {})
///  sort: minimongo sort specification (default: natural order)
///  render: render function (from object to element)
/// .. plus optionally
///  events: vaguely backbone-style live event specification
///    {'click #selector #path' : function (obj) { } }
///
/// returns an object with:
///  stop(): stop updating, tear everything down and let it get GC'd
Sky.ui.renderList = function (collection, element, options) {
  if (('$' in window) && (element instanceof $))
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
    var elt = Sky.deps.monitor(
      function () { return options.render(obj); },
      function () {
        var idx = query.indexOf(obj._id);
        if (idx !== -1) {
          element.insertBefore(render(obj), element.children[idx]);
          element.removeChild(element.children[idx + 1]);
        }
        // if idx === -1, then the liveQuery remove handler will have
        // taken care of removing the rendered element
      });

    Sky.ui._setupEvents(elt, options.events || {}, obj);
    return elt;
  };

  while (element.childNodes.length > 0)
    element.removeChild(element.childNodes[0]);

  // XXX duplicated in sky_client.js (hook_handlebars_each)
  var query = collection.findLive(options.query, {
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
