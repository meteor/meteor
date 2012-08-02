(function() {

Spark = {};

Spark._currentRenderer = new Meteor.EnvironmentVariable;

// XXX document contract for each type of annotation?
Spark._ANNOTATION_DATA = "_spark_data";
Spark._ANNOTATION_ISOLATE = "_spark_isolate";
Spark._ANNOTATION_EVENTS = "_spark_events";
Spark._ANNOTATION_WATCH = "_spark_watch";
Spark._ANNOTATIONS = [Spark._ANNOTATION_DATA, Spark._ANNOTATION_ISOLATE,
                      Spark._ANNOTATION_EVENTS, Spark._ANNOTATION_WATCH];

Spark._Renderer = function () {
  // Map from annotation ID to an annotation function, which is called
  // at render time and receives (startNode, endNode).
  this.annotations = {};
};

_.extend(Spark._Renderer.prototype, {
  // The annotation tags that we insert into HTML strings must be
  // unguessable in order to not create potential cross-site scripting
  // attack vectors, so we use random strings.  Even a well-written app
  // that avoids XSS vulnerabilities might, for example, put
  // unescaped < and > in HTML attribute values, where they are normally
  // safe.  We can't assume that a string like '<1>' came from us
  // and not arbitrary user-entered data.
  createId: function () {
    var id = "";
    var chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (var i = 0; i < 8; i++) {
      id += chars.substr(Math.floor(Meteor.random() * 64), 1);
    }
    return id;
  },

  // `what` can be a function that takes a LiveRange, or just a set of
  // attributes to add to the liverange.  tag and what are optional.
  // if no tag is passed, no liverange will be created.
  annotate: function (html, tag, what) {
    var id = tag + "-" + this.createId();
    this.annotations[id] = function (start, end) {
      if (! tag)
        return;
      var range = new LiveRange(tag, start, end);
      if (what instanceof Function)
        what(range);
      else
        _.extend(range, what);
    };

    return "<$" + id + ">" + html + "</$" + id + ">";
  }
});

////////// PUBLIC API

Spark.render = function (htmlFunc) {
  var renderer = new Spark._Renderer;
  var html = Spark._currentRenderer.withValue(renderer, function () {
    return renderer.annotate(htmlFunc());
  });

  var fragById = {};

  var replaceInclusions = function (container) {
    var n = container.firstChild;
    while (n) {
      var next = n.nextSibling;
      if (n.nodeType === 8) { // COMMENT
        var frag = fragById[n.nodeValue];
        if (frag === false) {
          // id already used!
          throw new Error("Spark HTML fragments may only be used once. " +
                          "Second use in " +
                          DomUtils.fragmentToHtml(container));
        } else if (frag) {
          fragById[n.nodeValue] = false; // mark as used
          DomUtils.wrapFragmentForContainer(frag, n.parentNode);
          n.parentNode.replaceChild(frag, n);
        }
      } else if (n.nodeType === 1) { // ELEMENT
        replaceInclusions(n);
      }
      n = next;
    }
  };

  var bufferStack = [[]];
  var idStack = [];

  var regex = /<(\/?)\$([^<>]+)>|<|[^<]+/g;
  regex.lastIndex = 0;
  var parts;
  while ((parts = regex.exec(html))) {
    var isOpen = ! parts[1];
    var id = parts[2];
    var annotationFunc = renderer.annotations[id];
    if (! annotationFunc) {
      bufferStack[bufferStack.length - 1].push(parts[0]);
    } else if (isOpen) {
      idStack.push(id);
      bufferStack.push([]);
    } else {
      var idOnStack = idStack.pop();
      if (idOnStack !== id)
        throw new Error("Range mismatch: " + idOnStack + " / " + id);
      var frag = DomUtils.htmlToFragment(bufferStack.pop().join(''));
      replaceInclusions(frag);
      // empty frag becomes HTML comment <!--empty--> so we have start/end
      // nodes to pass to the annotation function
      if (! frag.firstChild)
        frag.appendChild(document.createComment("empty"));
      annotationFunc(frag.firstChild, frag.lastChild);
      if (! idStack.length)
        // we're done; we just rendered the contents of the top-level
        // annotation that we wrapped around htmlFunc ourselves.
        // there may be unused fragments in fragById that include
        // LiveRanges, but only if the user broke the rules by including
        // an annotation somewhere besides element level, like inside
        // an attribute (which is not allowed).
        return frag;
      fragById[id] = frag;
      bufferStack[bufferStack.length - 1].push('<!--' + id + '-->');
    }
  }
};

var withRenderer = function (f) {
  return function (/* arguments */) {
    var renderer = Spark._currentRenderer.get();
    var args = _.toArray(arguments);
    if (!renderer)
      return args.pop();
    args.push(renderer);
    return f.apply(null, args);
  };
};

Spark.setDataContext = withRenderer(function (dataContext, html, _renderer) {
  return _renderer.annotate(
    html, Spark._ANNOTATION_DATA, { data: dataContext });
});

Spark.getDataContext = function (node) {
  var range = LiveRange.findRange(
    Spark._ANNOTATION_DATA, node);
  return range && range.data;
};

var universalListener = null;
var getListener = function () {
  if (!universalListener)
    universalListener = new UniversalEventListener(function (event) {
      // Handle a currently-propagating event on a particular node.
      // We walk all enclosing liveranges of the node, from the inside
      // out, looking for matching handlers.  If the app calls
      // stopPropagation(), we still call all handlers in all event
      // maps for the current node.  If the app calls
      // "stopImmediatePropagation()", we don't call any more
      // handlers.

      var range = LiveRange.findRange(Spark._ANNOTATION_EVENTS,
                                      event.currentTarget);
      while (range && !event.isImmediatePropagationStopped()) {
        range.handler(event);
        range = range.findParent();
      }
    });

  return universalListener;
};

Spark.attachEvents = withRenderer(function (eventMap, html, _renderer) {
  var listener = getListener();

  var handlerMap = {}; // type -> [{selector, callback}, ...]
  // iterate over eventMap, which has form {"type selector, ...": callback},
  // and populate handlerMap
  _.each(eventMap, function(callback, spec) {
    var clauses = spec.split(/,\s+/);
    // iterate over clauses of spec, e.g. ['click .foo', 'click .bar']
    _.each(clauses, function (clause) {
      var parts = clause.split(/\s+/);
      if (parts.length === 0)
        return;

      var type = parts.shift();
      var selector = parts.join(' ');

      handlerMap[type] = handlerMap[type] || [];
      handlerMap[type].push({selector: selector, callback: callback});
    });
  });

  var eventTypes = _.keys(handlerMap);

  var installHandlers = function (range) {
    _.each(eventTypes, function (t) {
      for(var n = range.firstNode(),
              after = range.lastNode().nextSibling;
          n && n !== after;
          n = n.nextSibling)
        listener.installHandler(n, t);
    });
  };

  html = _renderer.annotate(
    html, Spark._ANNOTATION_WATCH, {
      notify: function () {
        installHandlers(this);
      }
    });

  html = _renderer.annotate(
    html, Spark._ANNOTATION_EVENTS, function (range) {
      _.each(eventTypes, function (t) {
        listener.addType(t);
      });
      installHandlers(range);

      range.handler = function (event) {
        var handlers = handlerMap[event.type] || [];

        for (var i = 0; i < handlers.length; i++) {
          var handler = handlers[i];
          var callback = handler.callback;
          var selector = handler.selector;

          if (selector) {
            // This ends up doing O(n) findAllInRange calls when an
            // event bubbles up N level in the DOM. If this ends up
            // being too slow, we could memoize findAllInRange across
            // the processing of each event.
            var results = DomUtils.findAllInRange(range.firstNode(),
                                                  range.lastNode(), selector);
            // This is a linear search through what could be a large
            // result set.
            if (! _.contains(results, event.currentTarget))
              continue;
          } else {
            // if no selector, only match the event target
            if (event.currentTarget !== event.target)
              continue;
          }

          // Found a matching handler.
          var eventData = Spark.getDataContext(event.currentTarget);
          var returnValue = callback.call(eventData, event);

          // allow app to `return false` from event handler, just like
          // you can in a jquery event handler
          if (returnValue === false) {
            event.stopImmediatePropagation();
            event.preventDefault();
          }
          if (event.isImmediatePropagationStopped())
            break; // don't let any other handlers in this event map fire
        }
      };
    });

  return html;
});


Spark.isolate = function (htmlFunc) {
  var renderer = Spark._currentRenderer.get();
  if (!renderer)
    return htmlFunc();

  var ctx = new Meteor.deps.Context;
  var slain = false;
  var html =
    renderer.annotate(
      ctx.run(htmlFunc), Spark._ANNOTATION_ISOLATE,
      function (range) {
        range.finalize = function () {
          // "Fast" GC path -- someone called finalize on a document
          // fragment that includes us, so we're cleaning up our
          // invalidation context and going away.
          slain = true;
          ctx.invalidate();
        };

        ctx.on_invalidate(function () {
          if (slain)
            return; // killed by finalize. range has already been destroyed.

          if (!DomUtils.isInDocument(range.firstNode())) {
            // "Slow" GC path -- Evidently the user took some DOM nodes
            // offscreen without telling us. Finalize them.
            var node = range.firstNode();
            while (node.parentNode)
              node = node.parentNode;
            if (node["_protect"]) {
              // test code can use this property to mark a root-level node
              // (such as a DocumentFragment) as immune from slow-path GC
            } else {
              Spark.finalize(node);
              return;
            }
          }

          // htmlFunc changed its mind about what it returns. Rerender it.
          var frag = Spark.render(function () {
            return Spark.isolate(htmlFunc);
          });
          var oldContents = range.replace_contents(frag); // XXX should patch
          Spark.finalize(oldContents);
          notifyWatchers(range);
          range.destroy();
        });
      });

  return html;
};

var notifyWatchers = function (range) {
  // find the innermost WATCH annotation containing the nodes in `range`
  var tempRange = new LiveRange(Spark._ANNOTATION_WATCH, range.firstNode(),
                                range.lastNode(), true /* innermost */);
  var walk = tempRange.findParent();
  tempRange.destroy();

  // tell all enclosing WATCH annotations that their contents changed
  while (walk) {
    walk.notify();
    walk = walk.findParent();
  }
};

// Delete all of the liveranges in the range of nodes between `start`
// and `end`, and call their 'finalize' function if any. Or instead of
// `start` and `end` you may pass a fragment in `start`.
Spark.finalize = function (start, end) {
  if (! start.parentNode && start.nodeType !== 11 /* DocumentFragment */) {
    // Workaround for LiveRanges' current inability to contain
    // a node with no parentNode.
    var frag = document.createDocumentFragment();
    frag.appendChild(start);
    start = frag;
    end = null;
  }
  _.each(Spark._ANNOTATIONS, function (tag) {
    var wrapper = new LiveRange(tag, start, end);
    wrapper.visit(function (isStart, range) {
      isStart && range.finalize && range.finalize();
    });
    wrapper.destroy(true /* recursive */);
  });
};

})();
