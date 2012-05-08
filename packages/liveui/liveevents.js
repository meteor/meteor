Meteor.ui = Meteor.ui || {};

// LiveEvents is an implementation of event delegation, a technique that
// listens to events on a subtree of the DOM by binding handlers on the
// root.
//
// _attachEvents installs handlers on a range of nodes, specifically the
// top-level nodes of a template in LiveUI, and detects events on
// descendents using bubbling.  Events that bubble up are checked
// against the selectors in the event map to determine whether the
// user callback should be called.
//
// XXX We currently rely on jQuery for:
// - focusin/focusout support for Firefox
// - keeping track of handlers that have been bound
// - cross-browser event attaching (attachEvent/addEventListener)
// - event field and callback normalization (event.target, etc.)
//
// TODO: Fix event bubbling between multiple handlers.  Have a story for
// the order of handler invocation and stick to it, and have
// event.stopPropagation() always do the right thing.
// For example, in a DOM of the form DIV > UL > LI, we might have
// an event selector on the DIV of the form "click ul, click li" or
// even "click *".  In either case, every matched element should be
// visited in bottom-up order in a single traversal.  To do this,
// we need to have only one event handler per event type per liverange.
// Then, what about events bound at different levels?  Currently,
// handler firing order is determined first by liverange nesting
// level, and then by element nesting level.  For example, if a
// liverange around the DIV selects the LI for an event, and a
// liverange around the UL selects the UL, then you'd think an
// event on the LI would bubble LI -> UL -> DIV.  However, the handler
// on the UL will fire first.  This might be something to document
// rather than fix -- i.e., handlers in event maps in inner liveranges
// will always fire before those in outer liveranges, regardless of
// the selected nodes.  Most solutions requiring taking over the
// entire event flow, making live events play less well with the
// rest of the page or events bound by other libraries.  For example,
// binding all handlers at the top level of the document, or completely
// faking event bubbling somehow.

(function() {

  // for IE 6-8
  if (! document.addEventListener) {
    Meteor.ui._loadNonW3CEvents();
    return;
  }

  var SIMULATE_FOCUS_BLUR = 1;
  var SIMULATE_FOCUSIN_FOCUSOUT = 2;

  // If we have focusin/focusout, use them to simulate focus/blur.
  // This has the nice effect of making focus/blur synchronous in IE 9+.
  // It doesn't work in Firefox, which lacks focusin/focusout completely
  // as of v11.0.  This style of event support testing ('onfoo' in div)
  // doesn't work in Firefox 3.6, but does in IE and WebKit.
  var focusBlurMode = ('onfocusin' in document.createElement("DIV")) ?
        SIMULATE_FOCUS_BLUR : SIMULATE_FOCUSIN_FOCUSOUT;

  var prefix = '_liveevents_';

  var universalCapturer = function(event) {
    var type = event.type;
    var bubbles = event.bubbles;
    var target = event.target;

    target.addEventListener(type, universalHandler, false);

    // according to the DOM event spec, ancestors for bubbling
    // purposes are determined at dispatch time (and ignore changes
    // to the DOM after that)
    var ancestors;
    if (bubbles) {
      ancestors = [];
      for(var n = target.parentNode; n; n = n.parentNode) {
        n.addEventListener(type, universalHandler, false);
        ancestors.push(n);
      };
    }

    Meteor.defer(function() {
      target.removeEventListener(type, universalHandler);
      if (bubbles) {
        _.each(ancestors, function(n) {
          n.removeEventListener(type, universalHandler);
        });
      };
    });
  };

  var sendUIEvent = function(type, target, bubbles, cancelable, detail) {
    var event = document.createEvent("UIEvents");
    event.initUIEvent(type, bubbles, cancelable, window, detail);
    event.synthetic = true;
    target.dispatchEvent(event);
  };

  var doHandleHacks = function(event) {
    // fire synthetic focusin/focusout on blur/focus or vice versa
    if (event.currentTarget === event.target) {
      if (focusBlurMode === SIMULATE_FOCUS_BLUR) {
        if (event.type === 'focusin')
          sendUIEvent('focus', event.target, false);
        else if (event.type === 'focusout')
          sendUIEvent('blur', event.target, false);
      } else { // SIMULATE_FOCUSIN_FOCUSOUT
        if (event.type === 'focus')
          sendUIEvent('focusin', event.target, true);
        else if (event.type === 'blur')
          sendUIEvent('focusout', event.target, true);
      }
    }
    // only respond to synthetic events of the types we are faking
    if (focusBlurMode === SIMULATE_FOCUS_BLUR) {
      if (event.type === 'focus' || event.type === 'blur') {
        if (! event.synthetic)
          return false;
      }
    } else { // SIMULATE_FOCUSIN_FOCUSOUT
      if (event.type === 'focusin' || event.type === 'focusout') {
        if (! event.synthetic)
          return false;
      }
    }

    return true;
  };

  var doInstallHacks = function(node, eventType) {
    // install handlers for the events used to fake events of this type,
    // in addition to handlers for the real type
    if (focusBlurMode === SIMULATE_FOCUS_BLUR) {
      if (eventType === 'focus')
        Meteor.ui._installLiveHandler(node, 'focusin');
      else if (eventType === 'blur')
        Meteor.ui._installLiveHandler(node, 'focusout');
    } else { // SIMULATE_FOCUSIN_FOCUSOUT
      if (eventType === 'focusin')
        Meteor.ui._installLiveHandler(node, 'focus');
      else if (eventType === 'focusout')
        Meteor.ui._installLiveHandler(node, 'blur');
    }

  };

  var universalHandler = function(event) {
    if (doHandleHacks(event) === false)
      return;

    var curNode = event.currentTarget;
    if (! curNode)
      return;

    var innerRange = Meteor.ui._LiveRange.findRange(Meteor.ui._tag, curNode);
    if (! innerRange)
      return;

    var isPropagationStopped = false;

    var originalStopPropagation = event.stopPropagation;
    var originalPreventDefault = event.preventDefault;
    event.stopPropagation = function() {
      isPropagationStopped = true;
      originalStopPropagation.call(event);
    };
    event.preventDefault = function() {
      originalPreventDefault.call(event);
    };

    var type = event.type;

    for(var range = innerRange; range; range = range.findParent(true)) {
      if (! range.event_handlers)
        continue;

      _.each(range.event_handlers, function(h) {
        if (h.type !== type)
          return;

        var selector = h.selector;
        if (selector) {
          var contextNode = range.containerNode();
          var results = $(contextNode).find(selector);
          if (! _.contains(results, curNode))
            return;
        }

        var returnValue = h.callback.call(range.event_data, event);
        if (returnValue === false) {
          // extension due to jQuery
          event.stopPropagation();
          event.preventDefault();
        }
      });

      if (isPropagationStopped)
        break;
    }
  };

  Meteor.ui._installLiveHandler = function(node, eventType) {
    doInstallHacks(node, eventType);

    var propName = prefix + eventType;
    if (! document[propName]) {
      // only bind one event capturer per type
      document[propName] = true;
      document.addEventListener(eventType, universalCapturer, true);
    }

  };

  ////// WHAT WE SHOULD ACTUALLY DO
  ////// - have one handler, have it walk the liveranges?????
  //////   means a different abstraction boundary.

  var makeHandler = function(origType, selector, event_data, callback) {
    return function(e) {
      var event = (e || window.event);
      var curNode = (event.currentTarget || this);
      return handleEvent(
        origType, selector, event_data, callback, curNode, event);
    };
  };

  var handleEvent = function(origType, selector, event_data, callback,
                             curNode, event) {

    event.type = origType;
    event.target = (event.target || event.srcElement);

    if (selector) {
      // use element's parentNode as a "context"; any elements
      // referenced in the selector must be proper descendents
      // of the context.
      var contextNode = curNode.parentNode;
      var results = $(contextNode).find(selector);
      // target or ancestor must match selector
      var selectorMatch = null;
      for(var node = event.target;
          node !== contextNode;
          node = node.parentNode) {
        if (_.contains(results, node)) {
          // found the node that justifies handling
          // this event
          selectorMatch = node;
          break;
        }
        if (origType === 'focus' || origType === 'blur')
          break; // don't bubble
      }

      if (! selectorMatch)
        return;
    }

    callback.call(event_data, event);
  };

  // Wire up events to DOM nodes.
  //
  // `start` and `end` are sibling nodes in order that define
  // an inclusive range of DOM nodes.  `events` is an event map,
  // and `event_data` the object to bind to the callback (like the
  // Meteor.ui.render options of the same names).
  Meteor.ui._attachEvents = function (start, end, events, event_data) {
    events = events || {};

    var after = end.nextSibling;
    for(var node = start; node && node !== after; node = node.nextSibling) {

      // map of event type to array of arrays of handlers,
      // e.g. { click: [[handler1, handler2], [handler3]] }
      // attached to node
      var handler_data = node[tag];
      if (! handler_data)
        handler_data = node[tag] = {};

      // for handlers added this iteration, the array to extend
      // for additional handlers of the same type,
      // e.g. { click: [handler3] }
      var handlers_by_type = {};

      // iterate over `spec: callback` map
      _.each(events, function(callback, spec) {
        var clauses = spec.split(/,\s+/);
        _.each(clauses, function (clause) {
          var parts = clause.split(/\s+/);
          if (parts.length === 0)
            return;

          var eventType = parts.shift();
          var selector = parts.join(' ');
          var rewrittenEventType = eventType;
          // Rewrite focus and blur to non-bubbling focusin and focusout.
          // We are relying on jquery to simulate focusin/focusout in Firefox,
          // the only major browser that lacks support for them.
          // When removing jquery dependency, use event capturing in Firefox,
          // focusin/focusout in IE, and either in WebKit.
          switch (eventType) {
          case 'focus':
            rewrittenEventType = 'focusin';
            break;
          case 'blur':
            rewrittenEventType = 'focusout';
            break;
          case 'change':
            if (wireIEChangeSubmitHack)
              rewrittenEventType = 'cellchange';
            break;
          case 'submit':
            if (wireIEChangeSubmitHack)
              rewrittenEventType = 'datasetcomplete';
            break;
          }

          var t = rewrittenEventType;

          var handler_array = handlers_by_type[t];
          if (! handler_array) {
            handler_array = [];
            handler_data[t] = (handler_data[t] || []);
            handler_data[t].push(handler_array);
            handlers_by_type[t] = handler_array;
          }

          var handler = makeHandler(eventType, selector, event_data, callback);
          handler_array.push(handler);

          if (node.addEventListener)
            node.addEventListener(eventType, handler, false);
          else
            node.attachEvent('on'+eventType, handler);

        });
      });
    }
  };

  // Prepare newly-created DOM nodes for event delegation.
  //
  // This is a notification to liveevents that gives it a chance
  // to perform custom processing on nodes.  `start` and `end`
  // specify an inclusive range of siblings, and these nodes
  // and their descendents are processed, inserting any hooks
  // needed to make event delegation work.
  Meteor.ui._prepareForEvents = function(node) {

  };

  // Removes any events bound by Meteor.ui._attachEvent from
  // `node`.
  Meteor.ui._resetEvents = function(node) {

  };

  // Make 'change' event bubble in IE 6-8, the only browser where it
  // doesn't.  We also fix the quirk that change events on checkboxes
  // and radio buttons don't fire until blur, also on IE 6-8 and no
  // other known browsers.
  //
  // Our solution is to bind an event handler to every element that
  // might be the target of a change event.  The event handler is
  // generic, and simply refires a 'cellchange' event, an obscure
  // IE event that does bubble and is unlikely to be used in an app.
  // To fix checkboxes and radio buttons, use the 'propertychange'
  // event instead of 'change'.
  //
  // We solve the 'submit' event problem similarly, using the IE
  // 'datasetcomplete' event to bubble up a form submission.
  // The tricky part is that the app must be able to call
  // event.preventDefault() and have the form not submit.  This
  // is solved by blocking the original submit and calling
  // submit() later, which never fires a 'submit' event itself.
  //
  // Relevant info:
  // http://www.quirksmode.org/dom/events/change.html
  var wireIEChangeSubmitHack = null;
  if (document.attachEvent &&
      (! ('onchange' in document)) &&
      ('oncellchange' in document) &&
      ('ondatasetcomplete' in document)) {
    // IE <= 8
    wireIEChangeSubmitHack = function(start, end) {
      var wireNode = function(n) {
        if (n.nodeName === 'INPUT') {
          if (n.type === "checkbox" || n.type === "radio") {
            n.detachEvent('onpropertychange', changeSubmitHandlerIE);
            n.attachEvent('onpropertychange', changeSubmitHandlerIE);
          } else {
            n.detachEvent('onchange', changeSubmitHandlerIE);
            n.attachEvent('onchange', changeSubmitHandlerIE);
          }
        } else if (n.nodeName === 'FORM') {
          n.detachEvent('onsubmit', changeSubmitHandlerIE);
          n.attachEvent('onsubmit', changeSubmitHandlerIE);
        }
      };

      var after = end.nextSibling;
      for(var n = start; n && n !== after; n = n.nextSibling) {
        wireNode(n);
        if (n.firstChild) { // element nodes only
          _.each(n.getElementsByTagName('INPUT'), wireNode);
          _.each(n.getElementsByTagName('FORM'), wireNode);
        }
      }
    };
    // implement form submission after app has had a chance
    // to preventDefault
    document.attachEvent('ondatasetcomplete', function() {
      var evt = window.event;
      var target = evt && evt.srcElement;
      if (target && target.nodeName === 'FORM' &&
          evt.returnValue !== false)
        target.submit();
    });
  };

  // this function must be a singleton (i.e. only one instance of it)
  // so that detachEvent can find it.
  var changeSubmitHandlerIE = function() {
    var evt = window.event;
    var target = evt && evt.srcElement;
    if (! target)
      return;

    var newEvent = document.createEventObject();

    if (evt.type === 'propertychange' && evt.propertyName === 'checked'
        || evt.type === 'change') {
      // we appropriate 'oncellchange' as bubbling change
      target.fireEvent('oncellchange', newEvent);
    }

    if (evt.type === 'submit') {
      // we appropriate 'ondatasetcomplete' as bubbling submit.
      // call preventDefault now, let event bubble, and we
      // will submit the form later if the app doesn't
      // prevent it.
      evt.returnValue = false;
      target.fireEvent('ondatasetcomplete', newEvent);
    }
  };

})();