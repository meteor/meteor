// XXX rename liverange methods to camelCase?

// XXX adjust Spark API so that the modules (eg, list, events) could
// have been written by third parties on top of the public API?

// XXX rename isolate to reflect that it is the only root of
// deps-based reactivity ('track'? 'compute'? 'sync'?)

// XXX s/render/rendered/ (etc) in landmarks?

// XXX specify flush order someday (context dependencies? is this in
// the domain of spark -- overdraw concerns?)

// XXX if not on IE6-8, don't do the extra work (traversals for event
// setup) those browsers require

(function() {

Spark = {};

Spark._currentRenderer = new Meteor.EnvironmentVariable;

Spark._TAG = "_spark_" + Meteor.uuid();
// XXX document contract for each type of annotation?
Spark._ANNOTATION_NOTIFY = "notify";
Spark._ANNOTATION_DATA = "data";
Spark._ANNOTATION_ISOLATE = "isolate";
Spark._ANNOTATION_EVENTS = "events";
Spark._ANNOTATION_WATCH = "watch";
Spark._ANNOTATION_LABEL = "label";
Spark._ANNOTATION_LANDMARK = "landmark";
Spark._ANNOTATION_LIST = "list";
// XXX why do we need, eg, _ANNOTATION_ISOLATE? it has no semantics?

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
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    for (var i = 0; i < 8; i++) {
      id += chars.substr(Math.floor(Meteor.random() * 64), 1);
    }
    return id;
  },

  // `what` can be a function that takes a LiveRange, or just a set of
  // attributes to add to the liverange.  tag and what are optional.
  // if no tag is passed, no liverange will be created.
  annotate: function (html, type, what) {
    var id = type + ":" + this.createId();
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

// Turn the `html` string into a fragment, applying the annotations
// from 'renderer' in the process.
var materialize = function (html, renderer) {
  var fragById = {};

  // XXX refactor the parsing loop so we don't have to do this, and so
  // we can just take 'annotations' instead of the whole renderer
  // object
  html = renderer.annotate(html);

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

// Schedule setup tasks to run at the next flush, which is when the
// newly rendered fragment must be on the screen (if it doesn't want
// to get garbage-collected.)
//
// XXX expose in the public API, eg as Spark.introduce(), so the user
// can call it when manually inserting nodes? (via, eg, jQuery?)
var scheduleOnscreenSetup = function (frag) {
  var renderedRange = new LiveRange(Spark._TAG, frag);
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

    // This code can run several times on the same nodes (if the
    // output of a render is included in a render), so it must be
    // idempotent. This is not the best, asymptotically. There are
    // things we could do to improve it, like leaving renderedRange in
    // place and making notifyLandmarksRendered skip its contents (but
    // this would require that we adjust isolate() -- see comment
    // there about junk ranges), or letting each landmark schedule its
    // own onscreen processing.
    notifyLandmarksRendered(renderedRange);
    notifyWatchers(renderedRange.firstNode(), renderedRange.lastNode());
    renderedRange.destroy();
  });

  ctx.invalidate();
};

Spark.render = function (htmlFunc) {
  var renderer = new Spark._Renderer;
  var html = Spark._currentRenderer.withValue(renderer, htmlFunc);
  var frag = materialize(html, renderer);

  // create landmarks
  var tempRange = new LiveRange(Spark._TAG, frag);
  visitLandmarkTree({}, tempRange, function (landmark, node) {
    if (! landmark.created) { // guard for nested renders
      landmark.createCallback.call(landmark.state);
      landmark.created = true;
    }
  });
  tempRange.destroy();

  scheduleOnscreenSetup(frag);

  return frag;
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
//      newRange: LiveRange}
//
// `existingRange` is the range in the document whose contents are to
// be replaced. `newRange` holds the new contents and is not part of
// the document DOM tree.  The implementation will temporarily reparent
// the nodes in `newRange` into the document to check for selector matches.
var PreservationController = function () {
  this.roots = []; // keys 'landmark', 'fromRange', 'toRange'
  this.regionPreservations = [];
};

_.extend(PreservationController.prototype, {
  addRoot: function (context, preserve, fromRange, toRange) {
    var self = this;
    self.roots.push({ context: context, preserve: preserve,
                      fromRange: fromRange, toRange: toRange});
  },

  addConstantRegion: function (from, to) {
    var self = this;
    self.regionPreservations.push({
      type: "region",
      fromStart: from.firstNode(), fromEnd: from.lastNode(),
      newRange: to
    });
  },

  computePreservations: function (existingRange, newRange) {
    var self = this;
    var preservations = _.clone(self.regionPreservations);

    var visitLabeledNodes = function (context, clipRange, nodeLabeler, selector, func) {
      var nodes = DomUtils.findAllClipped(
        context, selector, clipRange.firstNode(), clipRange.lastNode());

      _.each(nodes, function (n) {
        var label = nodeLabeler(n);
        label && func(n, label);
      });
  };

    // Find the old incarnation of each of the preserved nodes
    _.each(self.roots, function (root) {
      root.fromNodesByLabel = {};
      _.each(root.preserve, function (nodeLabeler, selector) {
        root.fromNodesByLabel[selector] = {};
        visitLabeledNodes(root.context, root.fromRange, nodeLabeler, selector, function (n, label) {
          root.fromNodesByLabel[selector][label] = n;
        });
      });
    });

    // Temporarily put newRange into the document so that we can do
    // properly contextualized selector queries against it.
    //
    // Create a temporary range around newRange, and also around any enclosing
    // ranges that happen to also start and end on those nodes.  It is ok
    // to temporarily put these in the document as well, because CSS selectors
    // don't care and we will put them back.  `tempRange` will hold our place
    // in the tree `newRange` came from.
    var tempRange = new LiveRange(Spark._TAG, newRange.firstNode(), newRange.lastNode());
    var commentFrag = document.createDocumentFragment();
    commentFrag.appendChild(document.createComment(""));
    var newRangeFrag = tempRange.replace_contents(commentFrag);
    // `wrapperRange` will mark where we inserted newRange into the document.
    var wrapperRange = new LiveRange(Spark._TAG, newRangeFrag);
    existingRange.insert_before(newRangeFrag);

    _.each(self.roots, function (root) {
      _.each(root.preserve, function (nodeLabeler, selector) {
        visitLabeledNodes(root.context, root.toRange, nodeLabeler, selector, function (n, label) {
          var match = root.fromNodesByLabel[selector][label];
          if (match) {
            preservations.push({ type: "node", from: match, to: n });
            root.fromNodesByLabel[selector][label] = null;
          }
        });
      });
    });

    // Extraction is legal because we're just taking the document
    // back to the state it was in before insertBefore.
    var extractedFrag = wrapperRange.extract();
    wrapperRange.destroy();
    tempRange.replace_contents(extractedFrag);
    tempRange.destroy();

    return preservations;
  }
});

// Modify `range` so that it matches the result of
// Spark.render(htmlFunc). `range` must be in `document` (that is,
// onscreen.) If the old contents had any landmarks that match
// landmarks in `frag`, move the landmarks over and perform any node
// or region preservations that they request.
Spark.renderToRange = function (range, htmlFunc) {
  var pc = new PreservationController;

  // Find all of the landmarks in the old contents of the range
  var landmarkTree = {};
  visitLandmarkTree(landmarkTree, range, function (landmark, node) {
    node.original = landmark;
  });

  var renderer = new Spark._Renderer;
  var html = Spark._currentRenderer.withValue(renderer, htmlFunc);
  var frag = materialize(html, renderer);
  scheduleOnscreenSetup(frag);

  DomUtils.wrapFragmentForContainer(frag, range.containerNode());

  var tempRange = new LiveRange(Spark._TAG, frag);

  // match landmarks, moving state and creating preservation roots
  visitLandmarkTree(landmarkTree, tempRange, function (landmark, node) {
    if (node.original) {
      // copy state
      landmark.created = node.original.created;
      landmark.state = node.original.state;
      node.original.created = false; // prevent destroy()

      // if constant landmark, add a region preservation
      if (landmark.constant) {
        pc.addConstantRegion(node.original, landmark);
      }

      // add a node preservation root
      pc.addRoot(node.original.containerNode(), landmark.preserve,
                 node.original, landmark);

      // suppress future matching
      node.original = null;
    } else {
      if (! landmark.created) { // guard for nested renders
        landmark.createCallback.call(landmark.state);
        landmark.created = true;
      }
    }
  });

  // find preservation roots that come from landmarks enclosing the
  // updated region
  var walk = range;
  while ((walk = findParentOfType(Spark._ANNOTATION_LANDMARK, walk)))
    pc.addRoot(walk.containerNode(), walk.preserve,
               range, tempRange);

  // compute preservations (must do this before destorying tempRange)
  var preservations = pc.computePreservations(range, tempRange);

  tempRange.destroy();

  // patch (using preservations)
  range.operate(function (start, end) {
    // XXX this will destroy all liveranges, including ones
    // inside constant regions whose DOM nodes we are going
    // to preserve untouched
    Spark.finalize(start, end);
    Spark._patch(start.parentNode, frag, start.previousSibling,
                 end.nextSibling, preservations);
  });
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
            // This ends up doing O(n) findAllClipped calls when an
            // event bubbles up N level in the DOM. If this ends up
            // being too slow, we could memoize findAllClipped across
            // the processing of each event.
            var results = DomUtils.findAllClipped(
              range.containerNode(), selector, range.firstNode(), range.lastNode());
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

  return renderer.annotate(
    ctx.run(htmlFunc), Spark._ANNOTATION_ISOLATE, function (range) {
      range.finalize = function () {
        // Spark.finalize() was called on us (presumably because we were
        // removed from the document.) Tear down our structures without
        // doing any more updates. note that range is about to be
        // destroyed by finalize.
        range = null;
        ctx.invalidate();
      };

      var refresh = function () {
        if (! range)
          return; // killed by finalize. range has already been destroyed.

        ctx = new Meteor.deps.Context;
        var frag = Spark.renderToRange(range, function () {
          return ctx.run(htmlFunc);
        });
        ctx.on_invalidate(refresh);
      };

      ctx.on_invalidate(refresh);
    });
};

/******************************************************************************/
/* Lists                                                                      */
/******************************************************************************/

// Run 'f' at flush()-time. If atFlushTime is called multiple times,
// we guarantee that the 'f's will run in the order of their
// respective atFlushTime calls.
//
// XXX either break this out into a separate package or fold it into
// deps
var atFlushQueue = [];
var atFlushContext = null;
var atFlushTime = function (f) {
  atFlushQueue.push(f);

  if (! atFlushContext) {
    atFlushContext = new Meteor.deps.Context;
    atFlushContext.on_invalidate(function () {
      var f;
      while (f = atFlushQueue.shift()) {
        // Since atFlushContext is truthy, if f() calls atFlushTime
        // reentrantly, it's guaranteed to append to atFlushQueue and
        // not contruct a new atFlushContext.
        f();
      }
      atFlushContext = null;
    });

    atFlushContext.invalidate();
  }
};

Spark.list = function (cursor, itemFunc, elseFunc) {
  elseFunc = elseFunc || function () { return ''; };

  // If not in Spark.render, return static HTML.
  var renderer = Spark._currentRenderer.get();
  if (!renderer) {
    // XXX messy and maybe not strictly correct. add a 'contents'
    // method to observables that returns a snapshot.
    var contents = [];
    cursor.observe({
      added: function (item, beforeIndex) {
        contents.splice(beforeIndex, 0, item);
      }
    }).stop();

    if (contents.length)
      return _.map(contents, itemFunc).join('');
    else
      return elseFunc();
  }

  // Inside Spark.render. Return live list.
  return renderer.annotate('', Spark._ANNOTATION_LIST, function (outerRange) {
    var itemRanges = [];

    var replaceWithElse = function () {
      var frag = Spark.render(elseFunc);
      DomUtils.wrapFragmentForContainer(frag, outerRange.containerNode());
      Spark.finalize(outerRange.replace_contents(frag));
    };

    // Decorator. If we're rendering the list for the first time, call
    // the function immediately. Otherwise, defer it to flush time.
    var maybeDefer = function (func) {
      return function (/* arguments */) {
        var args = _.toArray(arguments);
        var callFunc = function () {
          func.apply(null, args);
        };

        if (! handle)
          callFunc();
        else
          atFlushTime(callFunc);
      };
    };

    var handle = cursor.observe({
      added: maybeDefer(function (item, beforeIndex) {
        var frag = Spark.render(_.bind(itemFunc, null, item));
        DomUtils.wrapFragmentForContainer(frag, outerRange.containerNode());
        var range = new LiveRange(Spark._TAG, frag);

        if (! itemRanges.length) {
          Spark.finalize(outerRange.replace_contents(frag));
        } else if (beforeIndex === itemRanges.length) {
          itemRanges[itemRanges.length - 1].insert_after(frag);
        } else {
          itemRanges[beforeIndex].insert_before(frag);
        }

        itemRanges.splice(beforeIndex, 0, range);
      }),
      removed: maybeDefer(function (item, atIndex) {
        if (itemRanges.length === 1)
          replaceWithElse();
        else
          Spark.finalize(itemRanges[atIndex].extract());

        itemRanges.splice(atIndex, 1);
      }),
      moved: maybeDefer(function (item, oldIndex, newIndex) {
        if (oldIndex === newIndex)
          return;

        var frag = itemRanges[oldIndex].extract();
        var range = itemRanges.splice(oldIndex, 1)[0];
        if (newIndex === itemRanges.length)
          itemRanges[itemRanges.length - 1].insert_after(frag);
        else
          itemRanges[newIndex].insert_before(frag);

        itemRanges.splice(newIndex, 0, range);
      }),
      changed: maybeDefer(function (item, atIndex) {
        Spark.renderToRange(itemRanges[atIndex], _.bind(itemFunc, null, item));
      })
    });

    if (! itemRanges.length)
      replaceWithElse();

    outerRange.finalize = function () {
      handle.stop();
    };
  });
};

/******************************************************************************/
/* Labels and landmarks                                                       */
/******************************************************************************/

// label must be a string.
// or pass label === null to not drop a label after all (meaning that
// this function is a noop)
Spark.labelBranch = function (label, htmlFunc) {
  var html = htmlFunc();

  var renderer = Spark._currentRenderer.get();
  if (! renderer || label === null)
    return html;

  return renderer.annotate(
    html, Spark._ANNOTATION_LABEL, { label: label });
};

Spark.createLandmark = withRenderer(function (options, html, _renderer) {
  // Normalize preserve map
  var preserve = {};
  if (options.preserve instanceof Array)
    _.each(options.preserve, function (selector) {
      preserve[selector] = true;
    });
  else
    preserve = options.preserve || {};
  for (var selector in preserve)
    if (typeof preserve[selector] !== 'function')
      preserve[selector] = function () { return true; };

  return _renderer.annotate(
    html, Spark._ANNOTATION_LANDMARK, {
      preserve: preserve,
      constant: !! options.constant,
      createCallback: options.create || function () {},
      renderCallback: options.render || function () {},
      destroyCallback: options.destroy || function () {},
      created: false,
      state: {},
      finalize: function () {
        if (this.created)
          this.destroyCallback.call(this.state);
      }
    });
});


// XXX could use docs, better name
var visitLandmarkTree = function (tree, range, func) {
  // Call 'func' for each landmark in 'range'. Pass two arguments to
  // 'func', the range, and an extra "notes" object such that two
  // landmarks receive the same (===) notes object iff they have the
  // same branch path. 'func' can write to the notes object so long as
  // it limits itself to attributes that do not start with '_'.
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

// Find all the landmarks in `range` and let them know that they are
// now onscreen. If it's their first time being onscreen, they need to
// have their `create` callback called. And they need `render` whether
// it is their first time or not. Idempotent.
var notifyLandmarksRendered = function (range) {
  range.visit(function (isStart, r) {
    if (isStart && r.type == Spark._ANNOTATION_LANDMARK) {
      if (!r.created)
        throw new Error("onscreen landmark hasn't been created?");

      if (!r.rendered) {
        // XXX should be render(start, end) ??
        r.renderCallback.call(r.state);
        r.rendered = true;
      }
    }
  });
};

})();