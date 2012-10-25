// XXX adjust Spark API so that the modules (eg, list, events) could
// have been written by third parties on top of the public API?

// XXX rename isolate to reflect that it is the only root of
// deps-based reactivity ('track'? 'compute'? 'sync'?)

// XXX specify flush order someday (context dependencies? is this in
// the domain of spark -- overdraw concerns?)

// XXX if not on IE6-8, don't do the extra work (traversals for event
// setup) those browsers require

// XXX flag errors if you have two landmarks with the same branch
// path, or if you have multiple preserve nodes in a landmark with the
// same selector and label

// XXX should functions with an htmlFunc use try/finally inside?

// XXX test that non-Spark.render case works for each function (eg,
// list() returns the expected HTML, Spark.createLandmark creates and
// then destroys a landmark -- may already be tested?)

// XXX in landmark-demo, if Template.timer.created throws an exception,
// then it is never called again, even if you push the 'create a
// timer' button again. the problem is almost certainly in atFlush
// (not hard to see what it is.)

(function() {

Spark = {};

Spark._currentRenderer = (function () {
  var current = null;
  return {
    get: function () {
      return current;
    },
    withValue: function (v, func) {
      var previous = current;
      current = v;
      try { return func(); }
      finally { current = previous; }
    }
  };
})();

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
Spark._ANNOTATION_LIST_ITEM = "item";
// XXX why do we need, eg, _ANNOTATION_ISOLATE? it has no semantics?

// Set in tests to turn on extra UniversalEventListener sanity checks
Spark._checkIECompliance = false;

Spark._globalPreserves = {};

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

var eventGuardActive = false;
// Spark does DOM manipulation inside an event guard to prevent events
// like "blur" from firing.  It would be nice to deliver these events
// in some cases, but running fresh event handling code on an invalid
// LiveRange tree can easily produce errors.
// This guard was motivated by seeing errors in Todos when switching
// windows while an input field is focused.
var withEventGuard = function (func) {
  var previous = eventGuardActive;
  eventGuardActive = true;
  try { return func(); }
  finally { eventGuardActive = previous; }
};

Spark._createId = function () {
  // Chars can't include '-' to be safe inside HTML comments.
  var chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+_";
  var id = "";
  for (var i = 0; i < 8; i++)
    id += chars.substr(Math.floor(Meteor.random() * 64), 1);
  return id;
};

Spark._Renderer = function () {
  // Map from annotation ID to an annotation function, which is called
  // at render time and receives (startNode, endNode).
  this.annotations = {};

  // Map from branch path to "notes" object, organized as a tree.
  // Each node in the tree has child pointers named ('_'+label).
  // Properties that don't start with '_' are arbitrary notes.
  // For example, the "happiness" of the branch path consisting
  // of labels "foo" and then "bar" would be
  // `this._branchNotes._foo._bar.happiness`.
  // Access to these notes is provided by LabelStack objects, of
  // which `this.currentBranch` is one.
  this._branchNotes = {};

  // The label stack representing the current branch path we
  // are in (based on calls to `Spark.labelBranch(label, htmlFunc)`).
  this.currentBranch = this.newLabelStack();

  // All landmark ranges created during this rendering.
  this.landmarkRanges = [];

  // Assembles the preservation information for patching.
  this.pc = new PreservationController;
};

_.extend(Spark._Renderer.prototype, {
  // `what` can be a function that takes a LiveRange, or just a set of
  // attributes to add to the liverange.  type and what are optional.
  // if no type is passed, no liverange will be created.
  // If what is a function, it will be called no matter what, even
  // if the annotated HTML was not used and no LiveRange was created,
  // in which case it gets null as an argument.
  annotate: function (html, type, what) {
    if (typeof what !== 'function') {
      var attribs = what;
      what = function (range) {
        if (range)
          _.extend(range, attribs);
      };
    }
    // The annotation tags that we insert into HTML strings must be
    // unguessable in order to not create potential cross-site scripting
    // attack vectors, so we use random strings.  Even a well-written app
    // that avoids XSS vulnerabilities might, for example, put
    // unescaped < and > in HTML attribute values, where they are normally
    // safe.  We can't assume that a string like '<1>' came from us
    // and not arbitrary user-entered data.
    var id = (type || '') + ":" + Spark._createId();
    this.annotations[id] = function (start, end) {
      if ((! start) || (! type)) {
        // ! start: materialize called us with no args because this
        // annotation wasn't used
        // ! type: no type given, don't generate a LiveRange
        what(null);
        return;
      }
      var range = makeRange(type, start, end);
      what(range);
    };

    return "<$" + id + ">" + html + "</$" + id + ">";
  },

  // A LabelStack is a mutable branch path that you can modify
  // by pushing or popping labels.  At any time, you can ask for
  // this Renderer's notes for the current branch path.
  // Renderer's `currentBranch` field is a LabelStack, but you
  // can create your own for the purpose of walking the branches
  // and accessing notes.
  newLabelStack: function () {
    var stack = [this._branchNotes];
    return {
      pushLabel: function (label) {
        var top = stack[stack.length - 1];
        var key = '_' + label;
        stack.push(top[key] = (top[key] || {}));
      },
      popLabel: function () {
        stack.pop();
      },
      getNotes: function () {
        var top = stack[stack.length - 1];
        return top;
      },
      // Mark this branch with `getNotes()[prop] = true` and also
      // walk up the stack marking parent branches (until an
      // existing truthy value for `prop` is found).
      // This makes it easy to test whether any descendent of a
      // branch has the mark.
      mark: function (prop) {
        for (var i = stack.length - 1;
             i >= 0 && ! stack[i][prop];
             i--)
          stack[i][prop] = true;
      }
    };
  },

  // Turn the `html` string into a fragment, applying the annotations
  // from 'renderer' in the process.
  materialize: function (htmlFunc) {
    var self = this;

    var html = Spark._currentRenderer.withValue(self, htmlFunc);
    html = self.annotate(html); // wrap with an anonymous annotation

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
      var annotationFunc = self.annotations[id];
      if (annotationFunc === false) {
        throw new Error("Spark HTML fragments may be used only once. " +
                        "Second use of: " +
                        DomUtils.fragmentToHtml(fragById[id]));
      } else if (! annotationFunc) {
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
        self.annotations[id] = false; // mark as used
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

    scheduleOnscreenSetup(ret, self.landmarkRanges);
    self.landmarkRanges = [];

    _.each(self.annotations, function(annotationFunc) {
      if (annotationFunc)
        // call annotation func with no arguments to mean "you weren't used"
        annotationFunc();
    });
    self.annotations = {};

    return ret;
  }

});

// Decorator for Spark annotations that take `html` and are
// pass-through without a renderer.  With this decorator,
// the annotation routine gets the current renderer, and
// if there isn't one returns `html` (the last argument).
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

// Schedule setup tasks to run at the next flush, which is when the
// newly rendered fragment must be on the screen (if it doesn't want
// to get garbage-collected.)
//
// 'landmarkRanges' is a list of the landmark ranges in 'frag'. It may be
// omitted if frag doesn't contain any landmarks.
//
// XXX expose in the public API, eg as Spark.introduce(), so the user
// can call it when manually inserting nodes? (via, eg, jQuery?) -- of
// course in that case 'landmarkRanges' would be empty.
var scheduleOnscreenSetup = function (frag, landmarkRanges) {
  var renderedRange = new LiveRange(Spark._TAG, frag);
  var finalized = false;
  renderedRange.finalize = function () {
    finalized = true;
  };

  Meteor._atFlush(function () {
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

    // Deliver render callbacks to all landmarks that are now
    // onscreen (possibly not for the first time.)
    _.each(landmarkRanges, function (landmarkRange) {
      if (! landmarkRange.isPreservedConstant)
        landmarkRange.rendered.call(landmarkRange.landmark);
    });

    // Deliver render callbacks to all landmarks that enclose the
    // updated region.
    //
    // XXX unify with notifyWatchers. maybe remove _ANNOTATION_WATCH
    // and just give everyone a contentsModified callback (sibling to
    // 'finalize')
    //
    // future: include an argument in the callback to distinguish this
    // case from the previous
    var walk = renderedRange;
    while ((walk = findParentOfType(Spark._ANNOTATION_LANDMARK, walk)))
      walk.rendered.call(walk.landmark);

    // This code can run several times on the same nodes (if the
    // output of a render is included in a render), so it must be
    // idempotent. This is not the best, asymptotically. There are
    // things we could do to improve it.
    notifyWatchers(renderedRange.firstNode(), renderedRange.lastNode());
    renderedRange.destroy();
  });
};

Spark.render = function (htmlFunc) {
  var renderer = new Spark._Renderer;
  var frag = renderer.materialize(htmlFunc);
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
  this.roots = []; // keys 'landmarkRange', 'fromRange', 'toRange'
  this.regionPreservations = [];
};

_.extend(PreservationController.prototype, {
  // Specify preservations that should be in effect on a fromRange/toRange
  // pair.  If specified, `optContextNode` should be an ancestor node of
  // fromRange that selectors are to be considered relative to.
  addRoot: function (preserve, fromRange, toRange, optContextNode) {
    var self = this;
    self.roots.push({ context: optContextNode, preserve: preserve,
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
      context = (context || clipRange.containerNode());
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
        visitLabeledNodes(
          root.context, root.fromRange, nodeLabeler, selector,
          function (n, label) {
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
    var newRangeFrag = tempRange.replaceContents(commentFrag);
    // `wrapperRange` will mark where we inserted newRange into the document.
    var wrapperRange = new LiveRange(Spark._TAG, newRangeFrag);
    existingRange.insertBefore(newRangeFrag);

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
    tempRange.replaceContents(extractedFrag);
    tempRange.destroy();

    return preservations;
  }
});


// XXX debugging
var pathForRange = function (r) {
  var path = [], r;
  while ((r = findParentOfType(Spark._ANNOTATION_LABEL, r)))
    path.unshift(r.label);
  return path.join(' :: ');
};

// `range` is a region of `document`. Modify it in-place so that it
// matches the result of Spark.render(htmlFunc), preserving landmarks.
Spark.renderToRange = function (range, htmlFunc) {
  var renderer = new Spark._Renderer();

  // Call 'func' for each landmark in 'range'. Pass two arguments to
  // 'func', the range, and an extra "notes" object such that two
  // landmarks receive the same (===) notes object iff they have the
  // same branch path. 'func' can write to the notes object so long as
  // it limits itself to attributes that do not start with '_'.
  var visitLandmarksInRange = function (range, func) {
    var stack = renderer.newLabelStack();

    range.visit(function (isStart, r) {
      if (r.type === Spark._ANNOTATION_LABEL) {
        if (isStart)
          stack.pushLabel(r.label);
        else
          stack.popLabel();
      } else if (r.type === Spark._ANNOTATION_LANDMARK && isStart) {
        func(r, stack.getNotes());
      }
    });
  };

  // Find all of the landmarks in the old contents of the range
  visitLandmarksInRange(range, function (landmarkRange, notes) {
    notes.originalRange = landmarkRange;
  });

  var frag = renderer.materialize(htmlFunc);

  DomUtils.wrapFragmentForContainer(frag, range.containerNode());

  var tempRange = new LiveRange(Spark._TAG, frag);

  // find preservation roots from matched landmarks inside the
  // rerendered region
  var pc = renderer.pc;
  visitLandmarksInRange(
    tempRange, function (landmarkRange, notes) {
      if (notes.originalRange) {
        if (landmarkRange.constant)
          pc.addConstantRegion(notes.originalRange, landmarkRange);

        pc.addRoot(landmarkRange.preserve,
                   notes.originalRange, landmarkRange);
      }
    });

  // find preservation roots that come from landmarks enclosing the
  // updated region
  var walk = range;
  while ((walk = findParentOfType(Spark._ANNOTATION_LANDMARK, walk)))
    pc.addRoot(walk.preserve, range, tempRange, walk.containerNode());

  pc.addRoot(Spark._globalPreserves, range, tempRange);

  // compute preservations (must do this before destroying tempRange)
  var preservations = pc.computePreservations(range, tempRange);

  tempRange.destroy();

  var results = {};

  // Patch! (using preservations)
  withEventGuard(function () {
    range.operate(function (start, end) {
      // XXX this will destroy all liveranges, including ones
      // inside constant regions whose DOM nodes we are going
      // to preserve untouched
      Spark.finalize(start, end);
      Spark._patch(start.parentNode, frag, start.previousSibling,
                   end.nextSibling, preservations, results);
    });
  });

  _.each(results.regionPreservations, function (landmarkRange) {
    // Rely on the fact that computePreservations only emits
    // region preservations whose ranges are landmarks.
    // This flag means that landmarkRange is a new constant landmark
    // range that matched an old one *and* was DOM-preservable by
    // the patcher.
    landmarkRange.isPreservedConstant = true;
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

      if (eventGuardActive)
        // swallow the event
        return;

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
      if (! range)
        return;

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
            if (! DomUtils.matchesSelectorClipped(
              event.currentTarget, range.containerNode(), selector,
              range.firstNode(), range.lastNode())) {
              continue;
            }
          } else {
            // if no selector, only match the event target
            if (event.currentTarget !== event.target)
              continue;
          }

          // Found a matching handler. Call it.
          var eventData = Spark.getDataContext(event.currentTarget);
          var landmarkRange =
                findParentOfType(Spark._ANNOTATION_LANDMARK, range);
          var landmark = (landmarkRange && landmarkRange.landmark);

          // Note that the handler can do arbitrary things, like call
          // Meteor.flush() or otherwise remove and finalize parts of
          // the DOM.  We can't assume `range` is valid past this point,
          // and we'll check the `finalized` flag at the top of the loop.
          var returnValue = callback.call(eventData, event, landmark);

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

  var range;
  var firstRun = true;
  var retHtml;
  Meteor.autorun(function (handle) {
    if (firstRun) {
      retHtml = renderer.annotate(
        htmlFunc(), Spark._ANNOTATION_ISOLATE,
        function (r) {
          if (! r) {
            // annotation not used; kill our context
            handle.stop();
          } else {
            range = r;
            range.finalize = function () {
              // Spark.finalize() was called on our range (presumably
              // because it was removed from the document.)  Kill
              // this context and stop rerunning.
              handle.stop();
            };
          }
        });
      firstRun = false;
    } else {
      Spark.renderToRange(range, htmlFunc);
    }
  });

  return retHtml;
};

/******************************************************************************/
/* Lists                                                                      */
/******************************************************************************/

Spark.list = function (cursor, itemFunc, elseFunc) {
  elseFunc = elseFunc || function () { return ''; };

  // Create a level of indirection around our cursor callbacks so we
  // can change them later
  var callbacks = {};
  var observerCallbacks = {};
  _.each(["added", "removed", "moved", "changed"], function (name) {
    observerCallbacks[name] = function () {
      return callbacks[name].apply(null, arguments);
    };
  });

  // Get the current contents of the cursor.
  // XXX currently we count on observe() using only added() to deliver
  // the initial contents. are we allow to do that, or do we need to
  // implement removed/moved/changed here as well?
  var initialContents = [];
  _.extend(callbacks, {
    added: function (item, beforeIndex) {
      initialContents.splice(beforeIndex, 0, item);
    }
  });
  var handle = cursor.observe(observerCallbacks);

  // Get the renderer, if any
  var renderer = Spark._currentRenderer.get();
  var maybeAnnotate = renderer ?
        _.bind(renderer.annotate, renderer) :
    function (html) { return html; };

  // Render the initial contents. If we have a renderer, create a
  // range around each item as well as around the list, and save them
  // off for later.
  var html = '';
  var outerRange;
  var itemRanges = [];
  if (! initialContents.length)
    html = elseFunc();
  else {
    for (var i = 0; i < initialContents.length; i++) {
      (function (i) {
        html += maybeAnnotate(itemFunc(initialContents[i]),
                              Spark._ANNOTATION_LIST_ITEM,
                              function (range) {
                                itemRanges[i] = range;
                              });
      })(i); // scope i to closure
    }
  }
  initialContents = null; // save memory
  var stopped = false;
  var cleanup = function () {
    handle.stop();
    stopped = true;
  };
  html = maybeAnnotate(html, Spark._ANNOTATION_LIST, function (range) {
    if (! range) {
      // We never ended up on the screen (caller discarded our return
      // value)
      cleanup();
    } else {
      outerRange = range;
      outerRange.finalize = cleanup;
    }
  });

  // No renderer? Then we have no way to update the returned html and
  // we can close the observer.
  if (! renderer)
    cleanup();

  // Called by `removed` and `moved` in order to cause render callbacks on
  // parent landmarks.
  // XXX This is not the final solution.  1) This code should be unified
  // with the code in scheduleOnscreenSetup.  2) In general, lists are
  // going to cause a lot of callbacks (one per collection callback).
  // Maybe that will make sense if we give render callbacks subrange info.
  var notifyParentsRendered = function () {
    var walk = outerRange;
    while ((walk = findParentOfType(Spark._ANNOTATION_LANDMARK, walk)))
      walk.rendered.call(walk.landmark);
  };

  var later = function (f) {
    Meteor._atFlush(function () {
      if (! stopped)
        withEventGuard(f);
    });
  };

  // The DOM update callbacks.
  _.extend(callbacks, {
    added: function (item, beforeIndex) {
      later(function () {
        var frag = Spark.render(_.bind(itemFunc, null, item));
        DomUtils.wrapFragmentForContainer(frag, outerRange.containerNode());
        var range = makeRange(Spark._ANNOTATION_LIST_ITEM, frag);

        if (! itemRanges.length) {
          Spark.finalize(outerRange.replaceContents(frag));
        } else if (beforeIndex === itemRanges.length) {
          itemRanges[itemRanges.length - 1].insertAfter(frag);
        } else {
          itemRanges[beforeIndex].insertBefore(frag);
        }

        itemRanges.splice(beforeIndex, 0, range);
      });
    },

    removed: function (item, atIndex) {
      later(function () {
        if (itemRanges.length === 1) {
          var frag = Spark.render(elseFunc);
          DomUtils.wrapFragmentForContainer(frag, outerRange.containerNode());
          Spark.finalize(outerRange.replaceContents(frag));
        } else
          Spark.finalize(itemRanges[atIndex].extract());

        itemRanges.splice(atIndex, 1);

        notifyParentsRendered();
      });
    },

    moved: function (item, oldIndex, newIndex) {
      later(function () {
        if (oldIndex === newIndex)
          return;

        var frag = itemRanges[oldIndex].extract();
        var range = itemRanges.splice(oldIndex, 1)[0];
        if (newIndex === itemRanges.length)
          itemRanges[itemRanges.length - 1].insertAfter(frag);
        else
          itemRanges[newIndex].insertBefore(frag);

        itemRanges.splice(newIndex, 0, range);

        notifyParentsRendered();
      });
    },

    changed: function (item, atIndex) {
      later(function () {
        Spark.renderToRange(itemRanges[atIndex], _.bind(itemFunc, null, item));
      });
    }
  });

  return html;
};

/******************************************************************************/
/* Labels and landmarks                                                       */
/******************************************************************************/

var nextLandmarkId = 1;

Spark.Landmark = function () {
  this.id = nextLandmarkId++;
  this._range = null; // will be set when put onscreen
};

_.extend(Spark.Landmark.prototype, {
  firstNode: function () {
    return this._range.firstNode();
  },
  lastNode: function () {
    return this._range.lastNode();
  },
  find: function (selector) {
    var r = this._range;
    return DomUtils.findClipped(r.containerNode(), selector,
                                r.firstNode(), r.lastNode());
  },
  findAll: function (selector) {
    var r = this._range;
    return DomUtils.findAllClipped(r.containerNode(), selector,
                                   r.firstNode(), r.lastNode());
  },
  hasDom: function () {
    return !! this._range;
  }
});

Spark.UNIQUE_LABEL = ['UNIQUE_LABEL'];

// label must be a string.
// or pass label === null to not drop a label after all (meaning that
// this function is a noop)
Spark.labelBranch = function (label, htmlFunc) {
  var renderer = Spark._currentRenderer.get();
  if (! renderer || label === null)
    return htmlFunc();

  if (label === Spark.UNIQUE_LABEL)
    label = Spark._createId();

  renderer.currentBranch.pushLabel(label);
  var html = htmlFunc();
  var occupied = renderer.currentBranch.getNotes().occupied;
  renderer.currentBranch.popLabel();

  if (! occupied)
    // don't create annotation if branch doesn't contain any landmarks.
    // if this label isn't on an element-level HTML boundary, then that
    // is certainly the case.
    return html;

  return renderer.annotate(
    html, Spark._ANNOTATION_LABEL, { label: label });

  // XXX what happens if the user doesn't use the return value, or
  // doesn't use it directly, eg, swaps the branches of the tree
  // around? "that's an error?" the result would be that the apparent
  // branch path of a landmark at render time would be different from
  // its apparent branch path in the actual document. seems like the
  // answer is to have labelBranch not drop an annotation, and keep
  // the branch label info outside of the DOM in a parallel tree of
  // labels and landmarks (likely similar to the one we're already
  // keeping?) a little tricky since not every node in the label tree
  // is actually populated with a landmark? (though we could change
  // that I guess -- they would be landmarks without any specific DOM
  // nodes?)
};

Spark.createLandmark = function (options, htmlFunc) {
  var renderer = Spark._currentRenderer.get();
  if (! renderer) {
    // no renderer -- create and destroy Landmark inline
    var landmark = new Spark.Landmark;
    options.created && options.created.call(landmark);
    var html = htmlFunc(landmark);
    options.destroyed && options.destroyed.call(landmark);
    return html;
  }

  // Normalize preserve map
  var preserve = {};
  if (_.isArray(options.preserve))
    _.each(options.preserve, function (selector) {
      preserve[selector] = true;
    });
  else
    preserve = options.preserve || {};
  for (var selector in preserve)
    if (typeof preserve[selector] !== 'function')
      preserve[selector] = function () { return true; };

  renderer.currentBranch.mark('occupied');
  var notes = renderer.currentBranch.getNotes();
  var landmark;
  if (notes.originalRange) {
    if (notes.originalRange.superceded)
      throw new Error("Can't create second landmark in same branch");
    notes.originalRange.superceded = true; // prevent destroyed(), second match
    landmark = notes.originalRange.landmark; // the old Landmark
  } else {
    landmark = new Spark.Landmark;
    if (options.created) {
      // Run callback outside the current Spark.isolate's deps context.
      // XXX Can't call run() on null, so this is a hack.  Running inside
      // a fresh context wouldn't be equivalent.
      var oldCx = Meteor.deps.Context.current;
      Meteor.deps.Context.current = null;
      try {
        options.created.call(landmark);
      } finally {
        Meteor.deps.Context.current = oldCx;
      }
    }
  }
  notes.landmark = landmark;

  var html = htmlFunc(landmark);
  return renderer.annotate(
    html, Spark._ANNOTATION_LANDMARK, function (range) {
      if (! range) {
        // annotation not used
        options.destroyed && options.destroyed.call(landmark);
        return;
      }

      _.extend(range, {
        preserve: preserve,
        constant: !! options.constant,
        rendered: options.rendered || function () {},
        destroyed: options.destroyed || function () {},
        landmark: landmark,
        finalize: function () {
          if (! this.superceded) {
            this.landmark._range = null;
            this.destroyed.call(this.landmark);
          }
        }
      });

      landmark._range = range;
      renderer.landmarkRanges.push(range);
    });
};

// used by unit tests
Spark._getEnclosingLandmark = function (node) {
  var range = findRangeOfType(Spark._ANNOTATION_LANDMARK, node);
  return range ? range.landmark : null;
};

})();
