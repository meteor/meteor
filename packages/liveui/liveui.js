Meteor.ui = Meteor.ui || {};

(function() {

  //////////////////// PUBLIC API

  Meteor.ui.render = function (html_func, options) {
    if (typeof html_func !== "function")
      throw new Error("Meteor.ui.render() requires a function as its first argument.");

    if (Meteor.ui._inRenderMode)
      throw new Error("Can't nest Meteor.ui.render.");

    return new Chunk(html_func, options)._asFragment();
  };

  Meteor.ui.chunk = function(html_func, options) {
    if (typeof html_func !== "function")
      throw new Error("Meteor.ui.chunk() requires a function as its first argument.");

    return new Chunk(html_func, options)._asHtml();
  };

  Meteor.ui.listChunk = function (observable, doc_func, else_func, options) {
    if (arguments.length === 3 && typeof else_func === "object") {
      // support optional else_func, arguments (observable, doc_func, options)
      options = else_func;
      else_func = null;
    }

    if (typeof doc_func !== "function")
      throw new Error("Meteor.ui.listChunk() requires a function as first argument");

    // else_func defaults to function returning ""
    else_func = (typeof else_func === "function" ? else_func :
                 function() { return ""; });

    // State:  Keeping track of our child chunks.
    // At any time, if the list is empty, then docChunks is [] and
    // elseChunk is a chunk; otherwise, docChunks is a list with a
    // chunk for each document, and elseChunk is null.
    var docChunks = [];
    var elseChunk = new Chunk(else_func);
    // The outer chunk that contains the other chunks and handles the
    // updates.  We don't create the outer chunk until after we have
    // called observable.observe(...) and handled the first wave of
    // updates.
    var outerChunk = null;

    // Queue updates due to observe callbacks, to process at flush time
    // when outerChunk's onupdate() fires.
    var queuedUpdates = [];
    var enqueue = function(f) {
      queuedUpdates.push(f);
      outerChunk && outerChunk.update();
    };
    var runQueuedUpdates = function() {
      _.each(queuedUpdates, function(qu) { qu(); });
      queuedUpdates.length = 0;
    };

    // Helper to insert a fragment into the document based on
    // document chunk index.
    var insertFrag = function(frag, i) {
      if (i === docChunks.length)
        docChunks[i-1]._range.insert_after(frag);
      else
        docChunks[i]._range.insert_before(frag);
    };

    // Register our data callbacks on the observable.
    //
    // The initial state of the list will be set by callbacks that
    // fire right away, typically (or always?) a sequence of "added"
    // calls.  Since there is no outerChunk yet, we distinguish
    // this case by outerChunk being falsy.
    //
    // Callbacks are responsible for maintaining the docChunks/elseChunk
    // state, manipulating the DOM as appropriate, and calling kill()
    // on chunks that are removed from the DOM so that they can be
    // cleaned up immediately.  Using enqueue(...), they defer action
    // until outerChunk.onupdate() is called.
    var handle = observable.observe({
      added: function(doc, before_idx) {
        enqueue(function() {
          var addedChunk = new Chunk(doc_func, {data: doc});

          if (outerChunk) {
            var frag = addedChunk._asFragment();
            if (elseChunk)
              // else case -> one item
              outerChunk._range.replace_contents(frag);
            else
              insertFrag(frag, before_idx);
          }

          elseChunk && elseChunk.kill();
          elseChunk = null;
          docChunks.splice(before_idx, 0, addedChunk);
        });
      },
      removed: function(doc, at_idx) {
        enqueue(function() {
          if (outerChunk) {
            if (docChunks.length === 1) {
              // one item -> else case
              elseChunk = new Chunk(else_func);
              var frag = elseChunk._asFragment();
              outerChunk._range.replace_contents(frag);
            } else {
              // remove item
              var removedChunk = docChunks[at_idx];
              removedChunk._range.extract();
            }
          }

          docChunks.splice(at_idx, 1)[0].kill();
        });
      },
      moved: function(doc, old_idx, new_idx) {
        enqueue(function() {
          if (old_idx === new_idx)
            return;

          var movedChunk = docChunks[old_idx];
          var frag;
          if (outerChunk) {
            // We know the list has at least two items,
            // at old_idx and new_idx, so `extract` will
            // succeed.
            var frag = movedChunk._range.extract();
            // remove chunk from list at old index
          }
          docChunks.splice(old_idx, 1);

          if (outerChunk)
            insertFrag(frag, new_idx);

          // insert chunk into list at new index
          docChunks.splice(new_idx, 0, movedChunk);
        });
      },
      changed: function(doc, at_idx) {
        enqueue(function() {
          var chunk = docChunks[at_idx];
          // set the chunk's data, which determines the argument
          // to doc_func.
          chunk._data = doc;
          if (outerChunk)
            chunk.update();
        });
      }
    });

    // Process the updates generated by the initial observe(...).
    runQueuedUpdates();

    // Create the outer chunk by calculating the appropriate HTML
    // and passing in the options we were given.
    outerChunk = new Chunk(function() {
      return _.map(
        (elseChunk ? [elseChunk] : docChunks),
        function(ch) { return ch._asHtml(); }).join('');
    }, options);

    // Override the normal behavior on update, which is to
    // recalculate the HTML and diff/patch the DOM.
    // Instead, we just run the incremental update functions
    // we've queued.
    outerChunk.onupdate = function() {
      runQueuedUpdates();
    };

    // Finalizer: when chunk is cleaned up, kill the observer handle.
    // This will happen even if the chunk is never used or listChunk
    // wasn't called inside render, as all Chunks are eventually
    // finalized after _asHtml() is called.
    outerChunk.onkill = function() {
      handle.stop();
    };

    return outerChunk._asHtml();
  };

  //////////////////// CHUNK OBJECT

  // A Chunk object ties together the following:
  //
  // - A function returning HTML (html_func -> self._calculate())
  // - A LiveRange (self._range) in the DOM
  // - A data object (options.data -> self._data)
  // - Event handlers (options.events -> self._eventHandlers)
  // - A rolling deps context for invalidation (self._context)
  // - A message queue for taking actions at flush time
  //
  // Since context invalidations are deferred until "flush time" by
  // Meteor.deps, it would be confusing at all levels if we sometimes
  // updated the DOM at other times.  Flush time is also the point at
  // which we can kill a chunk that is found to be offscreen (or was
  // never materialized as DOM).  Because of this, we defer all actions
  // until flush time via self._send(...).
  //
  // A newly-instantiated Chunk object is in an initial, "uncalculated"
  // state, with no HTML or DOM generated yet, and no LiveRange.  The
  // next step is to call either _asHtml() or _asFragment() to get
  // initial HTML or a complete reactive fragment for the chunk.
  // Once one of these methods is called, the chunk is guaranteed to
  // be visited at flush time (via the message queue), when it will
  // either survive, if it received a LiveRange and was added to the
  // document, or be killed.

  var Chunk = Meteor.ui._Chunk = function(html_func, options) {
    var self = this;

    options = options || {};

    self._range = null;
    self._calculate = function() {
      return html_func(this._data);
    };
    self._msgs = [];
    self._msgCx = null;
    self._data = (options.data || options.event_data || null); // XXX
    self._eventHandlers =
      options.events ? unpackEventMap(options.events) : null;
    self._killed = false;
    self._context = null;

    // Allow Meteor.deps to signal us about a data change by
    // invalidating self._context.  By the time we see the
    // invalidation, it's flush time.  We immediately set up
    // a new context for next time.
    // Always having the latest context in an instance variable
    // makes clean-up easier.
    var ondirty = function() {
      self._send("update");
      self._context = new Meteor.deps.Context;
      self._context.on_invalidate(ondirty);
    };
    self._context = new Meteor.deps.Context;
    self._context.on_invalidate(ondirty);

    // use original Context's unique id as our Chunk's unique id
    self.id = self._context.id;
  };

  // Returns HTML for this newly-created chunk, annotated with
  // comments containing the chunk's ID if we are in render mode.
  // The HTML is determined by calling self._calculate().
  Chunk.prototype._asHtml = function() {
    var self = this;

    var html = self._context.run(function() {
      return self._calculate();
    });

    if (typeof html !== "string")
      throw new Error("Render function must return a string");

    if (! Meteor.ui._inRenderMode) {
      // no reactivity possible, so kill the chunk (on next flush)
      self.kill();
      return html;
    } else {
      var id = self.id;
      newChunksById[id] = self;
      return "<!-- STARTCHUNK_"+id+" -->" + html +
        "<!-- ENDCHUNK_"+id+" -->";
    }
  };

  // Returns a reactive fragment for this newly-created chunk
  // by materializing the result of self._asHtml().
  Chunk.prototype._asFragment = function() {
    var self = this;
    var frag = materialize(
      function() { return self._asHtml(); },
      // Events will be wired at flush time anyway, but the developer might
      // expect them to be present immediately for some reason.  Unit tests
      // rely on this.
      wireEvents);
    // Indicate that we are at the root of a render.
    self._send("render");
    return frag;
  };

  // Called upon materialization of the chunk's HTML into DOM,
  // marking the point where we have a LiveRange.
  Chunk.prototype._gainRange = function(range) {
    var self = this;
    self._range = range;
    range.chunk = self;
    // Start the message queue.  Handling this message will cause
    // an offscreen check and potentially kill the chunk
    // if it never got used.
    self._send("added");
  };

  // Callback to update or re-render this chunk in the DOM.
  // Always called inside the chunk's dependency context.
  Chunk.prototype.onupdate = function() {
    // Default behavior on update is to recalculate the HTML
    // and patch the new DOM into place.

    var self = this;
    var frag = materialize(function() {
      return self._calculate();
    });

    // DIFF/PATCH

    var range = self._range;

    // Table-body fix:  if tgtRange is in a table and srcParent
    // contains a TR, wrap fragment in a TBODY on all browsers,
    // so that it will display properly in IE.
    if (range.containerNode().nodeName === "TABLE" &&
        _.any(frag.childNodes,
              function(n) { return n.nodeName === "TR"; })) {
      var tbody = document.createElement("TBODY");
      while (frag.firstChild)
        tbody.appendChild(frag.firstChild);
      frag.appendChild(tbody);
    }

    // Since we are patching from a source DOM with LiveRanges onto
    // a clean target DOM, when we decide to keep a node from the
    // target DOM we need to "transplant" (copy) the LiveRange data
    // from the source node.
    var copyFunc = function(t, s) {
      Meteor.ui._LiveRange.transplant_tag(Meteor.ui._tag, t, s);
    };

    range.operate(function(start, end) {
      // clear all LiveRanges on target
      cleanup_range(new Meteor.ui._LiveRange(Meteor.ui._tag, start, end));

      var patcher = new Meteor.ui._Patcher(
        start.parentNode, frag,
        start.previousSibling, end.nextSibling);
      patcher.diffpatch(copyFunc);
    });

    // Indicate that we are at the root of a re-render.
    self._send("render");
  };

  // Internal mechanism to enqueue a named message for this chunk,
  // to be processed at flush time.
  Chunk.prototype._send = function(message) {
    var self = this;

    self._msgs.push(message);

    var processMessage = function(msg) {
      if (self._killed)
        return;

      // If chunk is not onscreen at flush time, any message
      // is treated like "kill".  All future messages will be
      // ignored.
      if (msg === "kill" || (! self._range) || _checkOffscreen(self._range)) {
        // Pronounce this chunk dead.  We rely on this finalization to clean
        // up the deps context, which is first created in the constructor.
        // There are many ways for a chunk to die -- never rendered, never
        // added to the DOM, removed as part of an update, removed
        // surreptitiously -- but all roads lead here.
        self._range = null; // can't count on LiveRange in onkill handler
        self._killed = true;
        self._context.invalidate();
        self._context = null;
        self.onkill && self.onkill();
      } else if (msg === "added") {
        // This chunk is part of the document for the first time.
        wireEvents(self);
      } else if (msg === "update") {
        // Rerender this chunk in place, in whole or in part.
        self._context.run(function() {
          self.onupdate();
        });
      } else if (msg === "render") {
        // This chunk is the root of a Meteor.ui.render or a reactive
        // update.  Its descendent nodes are (most likely) new to the
        // document.
        wireEvents(self, true);
      }
    };

    // schedule message to be processed at flush time
    if (! self._msgCx) {
      var cx = new Meteor.deps.Context;
      cx.on_invalidate(function() {
        self._msgCx = null;
        var msgs = self._msgs;
        self._msgs = [];

        _.each(msgs, processMessage);
      });
      cx.invalidate();
      self._msgCx = cx;
    };
  };

  // Kills this chunk.  Safe to call at any time from anywhere.
  Chunk.prototype.kill = function() {
    // schedule killing for flush time.
    if (! this._killed)
      this._send("kill");
  };

  // Updates this chunk, as if a data dependency changed.
  Chunk.prototype.update = function() {
    // we'll get an "update" message at flush time.
    this._context.invalidate();
  };

  // Returns an array of immediate descendent chunks in the chunk
  // hierarchy.
  Chunk.prototype.childChunks = function() {
    if (! this._range)
      throw new Error("Chunk not rendered yet");

    var chunks = [];
    this._range.visit(function(is_start, r) {
      if (! is_start)
        return false;
      if (! r.chunk)
        return true; // allow for intervening LiveRanges
      chunks.push(r.chunk);
      return false;
    });

    return chunks;
  };

  // Returns this chunk's enclosing chunk in the hierarchy, if
  // any, or null.
  Chunk.prototype.parentChunk = function() {
    if (! this._range)
      throw new Error("Chunk not rendered yet");

    for(var r = this._range.findParent(); r; r = r.findParent())
      if (r.chunk)
        return r.chunk;

    return null;
  };

  // Finds the innermost enclosing chunk of a DOM node, if any, or
  // returns null.
  Meteor.ui._findChunk = function(node) {
    var range = Meteor.ui._LiveRange.findRange(Meteor.ui._tag, node);

    for(var r = range; r; r = r.findParent())
      if (r.chunk)
        return r.chunk;

    return null;
  };

  //////////////////// MATERIALIZATION (HTML -> DOM)

  Meteor.ui._tag = "_liveui";
  Meteor.ui._inRenderMode = false;
  var newChunksById = {}; // id -> chunk

  // Materializes HTML into DOM nodes and chunks.
  //
  // Calls calcHtml() in "render mode".  In render mode,
  // chunks register themselves in the newChunksById map
  // when they are converted into HTML and produce
  // HTML comments marking where the chunks begin and
  // end.  We use those comments to create LiveRanges
  // and associate them with the chunks.
  //
  // Once the comments are found and the new chunks are
  // given LiveRanges, we call chunkCallback on each one,
  // and then return a DocumentFragment of the materialized
  // DOM.
  var materialize = function(calcHtml, chunkCallback) {

    Meteor.ui._inRenderMode = true;

    var html;
    try {
      html = calcHtml();
    } finally {
      Meteor.ui._inRenderMode = false;
    }

    var frag = Meteor.ui._htmlToFragment(html);
    if (! frag.firstChild)
      frag.appendChild(document.createComment("empty"));

    var materializedChunks = [];

    // Helper that invokes `f` on every comment node under `parent`.
    // If `f` returns a node, visit that node next.
    var each_comment = function(parent, f) {
      for (var n = parent.firstChild; n;) {
        if (n.nodeType === 8) { // comment
          n = f(n) || n.nextSibling;
          continue;
        } else if (n.nodeType === 1) { // element
          each_comment(n, f);
        }
        n = n.nextSibling;
      }
    };

    // walk comments and create ranges
    var rangeStartNodes = {};
    each_comment(frag, function(n) {

      var rangeCommentMatch = /^\s*(START|END)CHUNK_(\S+)/.exec(n.nodeValue);
      if (! rangeCommentMatch)
        return null;

      var which = rangeCommentMatch[1];
      var id = rangeCommentMatch[2];

      if (which === "START") {
        if (rangeStartNodes[id])
          throw new Error("The return value of chunk can only be used once.");
        rangeStartNodes[id] = n;

        return null;
      }
      // else: which === "END"

      var startNode = rangeStartNodes[id];
      var endNode = n;
      var next = endNode.nextSibling;

      // try to remove comments
      var a = startNode, b = endNode;
      if (a.nextSibling && b.previousSibling) {
        if (a.nextSibling === b) {
          // replace two adjacent comments with one
          endNode = startNode;
          b.parentNode.removeChild(b);
          startNode.nodeValue = 'placeholder';
        } else {
          // remove both comments
          startNode = startNode.nextSibling;
          endNode = endNode.previousSibling;
          a.parentNode.removeChild(a);
          b.parentNode.removeChild(b);
        }
      } else {
        /* shouldn't happen; invalid HTML? */
      }

      if (startNode.parentNode !== endNode.parentNode) {
        // Try to fix messed-up comment ranges like
        // <!-- #1 --><tbody> ... <!-- /#1 --></tbody>,
        // which are extremely common with tables.  Tests
        // fail in all browsers without this code.
        if (startNode === endNode.parentNode ||
            startNode === endNode.parentNode.previousSibling) {
          startNode = endNode.parentNode.firstChild;
        } else if (endNode === startNode.parentNode ||
                   endNode === startNode.parentNode.nextSibling) {
          endNode = startNode.parentNode.lastChild;
        } else {
          var r = new RegExp('<!--\\s*STARTCHUNK_'+id+'.*?-->', 'g');
          var match = r.exec(html);
          var help = "";
          if (match) {
            var comment_end = r.lastIndex;
            var comment_start = comment_end - match[0].length;
            var stripped_before = html.slice(0, comment_start).replace(
                /<!--\s*(START|END)CHUNK.*?-->/g, '');
            var stripped_after = html.slice(comment_end).replace(
                /<!--\s*(START|END)CHUNK.*?-->/g, '');
            var context_amount = 50;
            var context = stripped_before.slice(-context_amount) +
                  stripped_after.slice(0, context_amount);
            help = " (possible unclosed near: "+context+")";
          }
          throw new Error("Could not create liverange in template. "+
                          "Check for unclosed tags in your HTML."+help);
        }
      }

      var range = new Meteor.ui._LiveRange(Meteor.ui._tag, startNode, endNode);
      var chunk = newChunksById[id];
      if (chunk) {
        chunk._gainRange(range);
        materializedChunks.push(chunk);
      }

      return next;
    });

    newChunksById = {};

    if (chunkCallback)
      _.each(materializedChunks, chunkCallback);

    return frag;
  };

  //////////////////// CHUNK EVENT SUPPORT

  var wireEvents = function(chunk, andEnclosing) {
    // Attach events to top-level nodes in `chunk` as specified
    // by its event handlers.
    //
    // If `andEnclosing` is true, we also walk up the chunk
    // hierarchy looking for event types we need to handle
    // based on handlers in ancestor chunks.  This is necessary
    // when a chunk is updated or a rendered fragment is added
    // to the DOM -- basically, when a chunk acquires ancestors.
    //
    // In modern browsers (all except IE <= 8), this level of
    // subtlety is not actually required, because the implementation
    // of Meteor.ui._event.registerEventType binds one handler
    // per type globally on the document.  However, the Old IE impl
    // takes advantage of it.

    var range = chunk._range;

    for(var c = chunk; c; c = c.parentChunk()) {
      var handlers = c._eventHandlers;

      if (handlers) {
        _.each(handlers.types, function(t) {
          for(var n = range.firstNode(), after = range.lastNode().nextSibling;
              n && n !== after;
              n = n.nextSibling)
            Meteor.ui._event.registerEventType(t, n);
        });
      }

      if (! andEnclosing)
        break;
    }
  };

  // Convert an event map from the developer into an internal
  // format for chunk._eventHandlers.  The internal format is
  // an array of objects with properties {type, selector, callback}.
  // The array has an expando property `types`, which is a list
  // of all the unique event types used (as an optimization for
  // code that needs this info).
  var unpackEventMap = function(events) {
    var handlers = [];

    var eventTypeSet = {};

    // iterate over `spec: callback` map
    _.each(events, function(callback, spec) {
      var clauses = spec.split(/,\s+/);
      // iterate over clauses of spec, e.g. ['click .foo', 'click .bar']
      _.each(clauses, function (clause) {
        var parts = clause.split(/\s+/);
        if (parts.length === 0)
          return;

        var type = parts.shift();
        var selector = parts.join(' ');

        handlers.push({type:type, selector:selector, callback:callback});
        eventTypeSet[type] = true;
      });
    });

    handlers.types = _.keys(eventTypeSet);
    return handlers;
  };

  // Handle a currently-propagating event on a particular node.
  // We walk all enclosing liveranges of the node, from the inside out,
  // looking for matching handlers.  If the app calls stopPropagation(),
  // we still call all handlers in all event maps for the current node.
  // If the app calls "stopImmediatePropagation()", we don't call any
  // more handlers.
  var handleEvent = function(event) {
    var curNode = event.currentTarget;
    if (! curNode)
      return;

    var innerChunk = Meteor.ui._findChunk(curNode);

    var type = event.type;

    for(var chunk = innerChunk; chunk; chunk = chunk.parentChunk()) {
      var event_handlers = chunk._eventHandlers;
      if (! event_handlers)
        continue;

      for(var i=0, N=event_handlers.length; i<N; i++) {
        var h = event_handlers[i];

        if (h.type !== type)
          continue;

        var selector = h.selector;
        if (selector) {
          var contextNode = chunk._range.containerNode();
          var results = $(contextNode).find(selector);
          if (! _.contains(results, curNode))
            continue;
        } else {
          // if no selector, only match the event target
          if (curNode !== event.target)
            continue;
        }

        var event_data = findEventData(event.currentTarget);

        // Call the app's handler/callback
        var returnValue = h.callback.call(event_data, event);

        // allow app to `return false` from event handler, just like
        // you can in a jquery event handler
        if (returnValue === false) {
          event.stopImmediatePropagation();
          event.preventDefault();
        }
        if (event.isImmediatePropagationStopped())
          return; // stop handling by this and other event maps
      }
    }

  };

  // find the innermost enclosing liverange that has event data
  var findEventData = function(node) {
    var innerChunk = Meteor.ui._findChunk(node);

    for(var chunk = innerChunk; chunk; chunk = chunk.parentChunk())
      if (chunk._data)
        return chunk._data;

    return null;
  };

  Meteor.ui._event.setHandler(handleEvent);


  //////////////////// OFFSCREEN CHECKING AND CLEANUP

  // Cleans up a range and its descendant ranges by killing
  // any attached chunks (which removes the associated contexts
  // from dependency tracking) and then destroying the LiveRanges
  // (which removes the liverange data from the DOM).
  var cleanup_range = function(range) {
    range.visit(function(is_start, range) {
      if (is_start)
        range.chunk && range.chunk.kill();
    });
    range.destroy(true);
  };

  var _checkOffscreen = function(range) {
    var node = range.firstNode();

    if (node.parentNode &&
        (Meteor.ui._onscreen(node) || Meteor.ui._is_held(node)))
      return false;

    cleanup_range(range);

    return true;
  };

  // Internal facility, only used by tests, for holding onto
  // DocumentFragments across flush().  Reference counts
  // using hold() and release().
  Meteor.ui._is_held = function(node) {
    while (node.parentNode)
      node = node.parentNode;

    return node.nodeType !== 3 /*TEXT_NODE*/ && node._liveui_refs;
  };
  Meteor.ui._hold = function(frag) {
    frag._liveui_refs = (frag._liveui_refs || 0) + 1;
  };
  Meteor.ui._release = function(frag) {
    // Clean up on flush, if hits 0.
    // Don't want to decrement
    // _liveui_refs to 0 now because someone else might
    // clean it up if it's not held.
    var cx = new Meteor.deps.Context;
    cx.on_invalidate(function() {
      --frag._liveui_refs;
      if (! frag._liveui_refs)
        // wrap the frag in a new LiveRange that will be destroyed
        cleanup_range(new Meteor.ui._LiveRange(Meteor.ui._tag, frag));
    });
    cx.invalidate();
  };

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

})();
