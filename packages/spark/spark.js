(function() {

Spark = {};

Spark._currentRenderer = new Meteor.EnvironmentVariable;

Spark._TAG = "_spark_"+Meteor.uuid();
// XXX document contract for each type of annotation?
Spark._ANNOTATION_NOTIFY = "notify";
Spark._ANNOTATION_DATA = "data";
Spark._ANNOTATION_ISOLATE = "isolate";
Spark._ANNOTATION_EVENTS = "events";
Spark._ANNOTATION_WATCH = "watch";
Spark._ANNOTATION_LABEL = "label";
Spark._ANNOTATION_LANDMARK = "landmark";

// Set in tests to turn on extra UniversalEventListener sanity checks
Spark._checkIECompliance = false;

var makeRange = function (type, start, end, inner) {
  var range = new LiveRange(Spark._TAG, start, end, inner);
  range.type = type;
  return range;
};

var findRangeOfType = function (type, node) {
  var range = LiveRange.findRange(Spark._TAG, node);
  while (range && range.type !== type)
    range = range.findParent();

  return range;
};

var findParentOfType = function (type, range) {
  do {
    range = range.findParent();
  } while (range && range.type !== type);

  return range;
};

var notifyWatchers = function (start, end) {
  var tempRange = new LiveRange(Spark._TAG, start, end, true /* innermost */);
  for (var walk = tempRange; walk; walk = walk.findParent())
    if (walk.type === Spark._ANNOTATION_WATCH)
      walk.notify();
  tempRange.destroy();
};

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
  annotate: function (html, type, what) {
    var id = type + "-" + this.createId();
    this.annotations[id] = function (start, end) {
      if (! type)
        return;
      var range = makeRange(type, start, end);
      if (what instanceof Function)
        what(range);
      else
        _.extend(range, what);
    };

    return "<$" + id + ">" + html + "</$" + id + ">";
  }
});

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

/******************************************************************************/
/* Render and finalize                                                        */
/******************************************************************************/

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
  var ret;

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
      if (! idStack.length) {
        // we're done; we just rendered the contents of the top-level
        // annotation that we wrapped around htmlFunc ourselves.
        // there may be unused fragments in fragById that include
        // LiveRanges, but only if the user broke the rules by including
        // an annotation somewhere besides element level, like inside
        // an attribute (which is not allowed).
        ret = frag;
        break;
      }
      fragById[id] = frag;
      bufferStack[bufferStack.length - 1].push('<!--' + id + '-->');
    }
  }

  // XXX break the below out into a new function, eg
  // Spark.introduce(), that the user can use when manually inserting
  // nodes (via, eg, jQuery?)

  // Schedule setup tasks to run at the next flush, which is when the
  // newly rendered fragment must be on the screen (if it doesn't want
  // to get garbage-collected.)
  var renderedRange = new LiveRange(Spark._TAG, ret);
  var finalized = false;
  renderedRange.finalize = function () {
    finalized = true;
  };

  var ctx = new Meteor.deps.Context;
  ctx.on_invalidate(function () {
    if (finalized)
      return;

    if (!DomUtils.isInDocument(renderedRange.firstNode())) {
      // We've detected that some nodes were taken off the screen
      // without calling Spark.finalize(). This could be because the
      // user rendered them, but didn't insert them in the document
      // before the next flush(). Or it could be because they used to
      // be onscreen, but they were manually taken offscreen (eg, with
      // jQuery) and the user neglected to call finalize() on the
      // removed nodes. Help the user out by finalizing the entire
      // subtree that is offscreen.
      var node = renderedRange.firstNode();
      while (node.parentNode)
        node = node.parentNode;
      if (node["_protect"]) {
        // test code can use this property to mark a root-level node
        // (such as a DocumentFragment) as immune from
        // autofinalization. effectively, the DocumentFragment is
        // considered to be a first-class peer of `document`.
      } else {
        Spark.finalize(node);
        return;
      }
    }

    notifyLandmarksOnscreen(range);
    notifyWatchers(renderedRange.firstNode(), renderedRange.lastNode());
    renderedRange.destroy();
  });
  ctx.invalidate();

  return ret;
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
  var wrapper = new LiveRange(Spark._TAG, start, end);
  wrapper.visit(function (isStart, range) {
    isStart && range.finalize && range.finalize();
  });
  wrapper.destroy(true /* recursive */);
};

/******************************************************************************/
/* Data contexts                                                              */
/******************************************************************************/

Spark.setDataContext = withRenderer(function (dataContext, html, _renderer) {
  return _renderer.annotate(
    html, Spark._ANNOTATION_DATA, { data: dataContext });
});

Spark.getDataContext = function (node) {
  var range = findRangeOfType(Spark._ANNOTATION_DATA, node);
  return range && range.data;
};

/******************************************************************************/
/* Events                                                                     */
/******************************************************************************/

var universalListener = null;
var getListener = function () {
  if (!universalListener)
    universalListener = new UniversalEventListener(function (event) {
      // Handle a currently-propagating event on a particular node.
      // We walk each enclosing liverange of the node and offer it the
      // chance to handle the event. It's range.handler's
      // responsibility to check isImmediatePropagationStopped()
      // before delivering events to the user. We precompute the list
      // of enclosing liveranges to defend against the case where user
      // event handlers change the DOM.

      var ranges = [];
      var walk = findRangeOfType(Spark._ANNOTATION_EVENTS,
                                 event.currentTarget);
      while (walk) {
        ranges.push(walk);
        walk = findParentOfType(Spark._ANNOTATION_EVENTS, walk);
      }
      _.each(ranges, function (r) {
        r.handler(event);
      });
    }, Spark._checkIECompliance);

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

  var finalized = false;

  html = _renderer.annotate(
    html, Spark._ANNOTATION_EVENTS, function (range) {
      _.each(eventTypes, function (t) {
        listener.addType(t);
      });
      installHandlers(range);

      range.finalize = function () {
        finalized = true;
      };

      range.handler = function (event) {
        var handlers = handlerMap[event.type] || [];

        for (var i = 0; i < handlers.length; i++) {
          if (finalized || event.isImmediatePropagationStopped())
            return;

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

          // Found a matching handler. Call it.
          var eventData = Spark.getDataContext(event.currentTarget);
          // Note that the handler can do arbitrary things, like call
          // Meteor.flush() or otherwise remove and finalize parts of
          // the DOM.  We can't assume `range` is valid past this point,
          // and we'll check the `finalized` flag at the top of the loop.
          var returnValue = callback.call(eventData, event);

          // allow app to `return false` from event handler, just like
          // you can in a jquery event handler
          if (returnValue === false) {
            event.stopImmediatePropagation();
            event.preventDefault();
          }
        }
      };
    });

  return html;
});

/******************************************************************************/
/* Isolate                                                                    */
/******************************************************************************/

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
          // Spark.finalize() was called on us (presumably because we
          // were removed from the document.) Tear down our structures
          // without doing any more updates.
          slain = true;
          ctx.invalidate();
        };

        ctx.on_invalidate(function () {
          if (slain)
            return; // killed by finalize. range has already been destroyed.

          // htmlFunc changed its mind about what it returns. Rerender it.
          var frag = Spark.render(function () {
            return Spark.isolate(htmlFunc);
          });

          var tempRange = makeRange(Spark._ANNOTATION_ISOLATE, frag, null,
                                    true /* inner */);
          tempRange.operate(function (start, end) {
            // Wrap contents of frag, *inside* the ISOLATE annotation,
            // as appropriate for insertion into `range`. We want the
            // wrapping inside the range so that if you have a <table>
            // containing an isolate, and the isolate returns a <tr>
            // sometimes and a <thead> other times, the wrapping will
            // change as appropriate.
            DomUtils.wrapFragmentForContainer(frag, range.containerNode());
          });
          tempRange.destroy();

          var oldContents = replaceContentsRespectingLandmarks(range, frag);
          Spark.finalize(oldContents);
          range.destroy();
        });
      });

  return html;
};

/******************************************************************************/
/* Labels and landmarks                                                       */
/******************************************************************************/

Spark.labelBranch = withRenderer(function (label, html, _renderer) {
  return _renderer.annotate(
    html, Spark._ANNOTATION_LABEL, { label: label });
});

Spark.createLandmark = withRenderer(function (options, html, _renderer) {
  // Normalize preserve map
  var preserve = {};
  if (options.preserve instanceof Array)
    _.each(options.preserve, function (selector) {
      preserve[selector] = true;
    });
  else
    preserve = options.preserve;
  for (var selector in preserve)
    if (typeof preserve[selector] !== 'function')
      preserve[selector] = function () { return true; }

  return _renderer.annotate(
    html, Spark._ANNOTATION_LANDMARK, {
      preserve: preserve,
      constant: !! options.constant,
      create: options.create || function () {},
      render: options.render || function () {},
      destroy: options.destroy || function () {},
      created: false,
      state: {},
      finalize: function () {
        if (this.created)
          this.destroy.call(this.state);
      }
    });
});

// Replace the contents of `range` with the fragment `frag`. Return
// the old contents of `range`. If the old contents had any landmarks
// that match landmarks in `frag`, move the landmarks over and perform
// any node or region preservations that they request.
var replaceContentsRespectingLandmarks = function (range, frag) {
  var tempRange = new LiveRange(Spark._TAG, frag);
  var preservations = computePreservations(range, tempRange);
  moveLandmarks(range, tempRange);
  tempRange.destroy();

  // XXX should patch (using preservations)
  return range.replace_contents(frag);
};

var notifyLandmarksOnscreen = function (range) {
  range.visit(function (isStart, r) {
    if (isStart && r.type == Spark._ANNOTATION_LANDMARK) {
      if (!r.created) {
        r.create.call(r.state);
        r.created = true;
      }
      r.render.call(r.state);
    }
  });
};

// Find all pairs of landmarks (A, B) such that A is in range1, B is
// in range2, and the branch keys of A and B are the same (with
// respect to range1 and range2 respecively.) (The branch key of a
// landmark L with respect to a range R is the concatenation of all of
// L's enclosing branch labels up to R.) For each such pair, call
// func(A, B).
//
// range1 and range2 must not overlap; if they do, the results are
// undefined. Branch keys should be unique within each range (there
// should only be one landmark in range1 with a given branch key with
// respect to range1); if not, this function will arbitrarily pick one
// of the landmarks with a given key and ignore the rest.
var visitMatchingLandmarks = function (range1, range2, func) {
  var tree = {};

  // Call 'func' for each landmark in 'range'. Pass two arguments to
  // 'func', the range, and an extra "notes" object such that two
  // landmarks receive the same (===) notes object iff they have the
  // same branch path. 'func' can write to the notes object so long as
  // it limits itself to attributes that do not start with '_'.
  var visit = function (range, func) {
    var stack = [tree];

    range.visit(function (isStart, r) {
      var top = stack[stack.length - 1];

      if (r.type === Spark._ANNOTATION_LABEL) {
        if (isStart) {
          var key = '_' + r.label;
          stack.push(top[key] = (top[key] || {}));
        } else
          stack.pop();
      } else if (r.type === Spark._ANNOTATION_LANDMARK && isStart)
        func(r, top);
    });
  };

  visit(range1, function (r, note) {
    note.match = range;
  });

  visit(range2, function (r, note) {
    if (note.match) {
      func(note.match, r);
      note.match = null;
    }
  });
};

// Find all of all nodes and regions that should be preserved in
// patching. Return a list of objects. There are two kinds of objects
// in the list:
//
// A preserved node:
//   {type: "node", from: Node, to: Node}
//
// A preserved (constant) region:
//   {type: "region", fromStart: Node, fromEnd: Node,
//      toStart: Node, toEnd: Node}
var computePreservations = function (oldRange, newRange) {
  visitMatchingLandmarks(oldRange, newRange, function (from, to) {
    // XXX
  });
};

// Look for landmarks in oldRange that match landmarks in
// newRange. Where matches are found, delete the landmark in newRange
// and move the landmark in oldRange to take its place. Where matches
// aren't found, leave the landmarks as they are.
//
// When a landmark in newRange is destroyed (by replacing it with an
// existing landmark from oldRange), the landmark's destroy() callback
// is not called. So this function should be called before created()
// has been called on the landmarks in newRange.
var moveLandmarks = function (oldRange, newRange) {
  var dead = [];
  visitMatchingLandmarks(oldRange, newRange, function (from, to) {
    to.created = from.created;
    to.state = from.state;
    dead.push(from); // don't destroy during visit
  });
  _.each(dead, function (r) {
    // XXX means that finalize won't get called on the range
    r.destroy();
  });
};


/*
var visitLandmarks = function(range, visit) {
  var labelPath = [];
  range.visit(function (isStart, r) {
    if (r.type === Spark._ANNOTATION_LABEL) {
      if (isStart)
        labelPath.push(r.label);
      else
        labelPath.pop();
    } else if (r.type === Spark._ANNOTATION_LANDMARK && isStart) {
      visit(r, _.map(labelPath, encodeURIComponent).join('/');
    }
  });
};
*/




  // Match branch keys and copy chunkState from liveranges in the
  // interior of oldRange onto matching liveranges in newFrag.
  // Return pairs of matching DOM nodes to preserve.
  var matchChunks = function(oldRange, newFrag) {
    if (! newFrag.firstChild)
      return []; // allow empty newFrag

    var oldChunks = {}; // { path -> range }
    var currentPath = []; // list of branch keys (path segments)

    // visit the interior of outerRange and call
    // `func(r, path)` on every range with a branch key,
    // where `path` is a string representation of the
    // branch key path
    var eachKeyedChunk = function(outerRange, func) {
      // call func on outerRange to support top-level unkeyed
      // chunks, like frag resulting from Template.foo()??
      func(outerRange, '');
      // visit interior of outerRange
      outerRange.visit(function(is_start, r) {
        if (r.branch) {
          if (is_start) {
            currentPath.push(r.branch);
            func(r, currentPath.join('\u0000'));
          } else {
            currentPath.pop();
          }
        }
      });
    };

    // collect old chunks keyed by their branch key paths
    eachKeyedChunk(oldRange, function(r, path) {
      oldChunks[path] = r;
    });

    // Run the selectors from preserveMap over the nodes
    // in range and create a map { label -> node }.
    var collectLabeledNodes = function(range, preserveMap) {
      var labeledNodes = {};
      _.each(preserveMap, function(labelFunc, sel) {
        var matchingNodes = DomUtils.findAllInRange(
          range.firstNode(), range.lastNode(), sel);
        _.each(matchingNodes, function(n) {
          // labelFunc can be a function or a constant,
          // the latter for single-match selectors {'.foo': 1}
          var pernodeLabel = (
            typeof labelFunc === 'function' ? labelFunc(n) : labelFunc);
          // falsy pernodeLabel is not considered a label
          if (pernodeLabel) {
            var fullLabel = sel+'/'+pernodeLabel;
            // in case of duplicates, we ignore the second node (this one).
            // eventually, the developer might want to get debug info.
            if (! labeledNodes[fullLabel])
              labeledNodes[fullLabel] = n;
          }
        });
      });
      return labeledNodes;
    };

    var nodeMatches = []; // [[oldNode, newNode], ...]

    // create a temporary range around newFrag in order
    // to visit it.
    var tempRange = new LiveRange(Meteor.ui._tag, newFrag);
    // visit new frag
    eachKeyedChunk(tempRange, function(r, path) {
      var oldRange = oldChunks[path];
      if (oldRange) {
        // matched chunk
        var rangeForOpts = r;
        if (r === tempRange) {
          // top level; don't copy chunkState to tempRange!
          // use oldRange for `preserve` and other options
          rangeForOpts = oldRange;
        } else {
          // copy over chunkState
          r.chunkState = oldRange.chunkState;
          oldRange.chunkState = null; // don't call offscreen() on old range
        }
        // any second occurrence of `path` is ignored (not matched)
        delete oldChunks[path];

        var preserveMap = rangeForOpts.preserve;
        var isConstant = rangeForOpts.constant;

        if (isConstant) {
          // add a range match
          var a = [oldRange.firstNode(), r.firstNode(),
                   oldRange.lastNode(), r.lastNode(), rangeForOpts];
          a.rangeMatch = true;
          nodeMatches.push(a);
        } else {
          var oldLabeledNodes = collectLabeledNodes(oldRange, preserveMap);
          var newLabeledNodes = collectLabeledNodes(r, preserveMap);
          _.each(newLabeledNodes, function(newNode, label) {
            var oldNode = oldLabeledNodes[label];
            if (oldNode)
              nodeMatches.push([oldNode, newNode]);
          });
        }
      }
    });
    tempRange.destroy();

    return nodeMatches;
  };












var patch = function (oldRange, newFrag) {

//           var oldContents = range.replace_contents(frag); // XXX should patch
 var processLandmarksAtPatchTime = function (
