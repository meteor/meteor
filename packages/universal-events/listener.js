// Meteor Universal Events -- Normalized cross-browser event handling library
//
// This module lets you set up a function f that will be called
// whenever an event fires on any element in the DOM. Specifically,
// when an event fires on node N, f will be called with N. Then, if
// the event is a bubbling event, f will be called again with N's
// parent, then called again with N's grandparent, etc, until the root
// of the document is reached. This provides a good base on top of
// which custom event handling systems can be implemented.
//
// f also receives the event object for the event that fired. The
// event object is normalized and extended to smooth over
// cross-browser differences in event handling. See the details in
// setHandler.
//
// Usage:
//   var listener = new UniversalEventListener(function (event) { ... });
//   listener.addType("click");
//
// If you want to support IE <= 8, you must also call installHandler
// on each subtree of DOM nodes on which you wish to receive events,
// eg, before inserting them into the document.
//
// Universal Events works reliably for events that fire on any DOM
// element. It may not work consistently across browsers for events
// that are intended to fire on non-element nodes (eg, text nodes).
// We're not sure if it's possible to handle those events consistently
// across browsers, but in any event, it's not a common use case.
//
// Implementation notes:
//
// Internally, there are two separate implementations, one for modern
// browsers (in events-w3c.js), and one for old browsers with no
// event capturing support (in events-ie.js.) The correct
// implementation will be chosen for you automatically at runtime.

(function () {

  var listeners = [];

  var returnFalse = function() { return false; };
  var returnTrue = function() { return true; };

  // inspired by jquery fix()
  var normalizeEvent = function (event) {
    var originalStopPropagation = event.stopPropagation;
    var originalPreventDefault = event.preventDefault;
    event.isPropagationStopped = returnFalse;
    event.isImmediatePropagationStopped = returnFalse;
    event.isDefaultPrevented = returnFalse;
    event.stopPropagation = function() {
      event.isPropagationStopped = returnTrue;
      if (originalStopPropagation)
        originalStopPropagation.call(event);
      else
        event.cancelBubble = true; // IE
    };
    event.preventDefault = function() {
      event.isDefaultPrevented = returnTrue;
      if (originalPreventDefault)
        originalPreventDefault.call(event);
      else
        event.returnValue = false; // IE
    };
    event.stopImmediatePropagation = function() {
      event.stopPropagation();
      event.isImmediatePropagationStopped = returnTrue;
    };

    var type = event.type;

    // adapted from jquery
    if (event.metaKey === undefined)
      event.metaKey = event.ctrlKey;
    if (/^key/.test(type)) {
      // KEY EVENTS
      // Add which.  Technically char codes and key codes are
      // different things; the former is ASCII/unicode/etc and the
      // latter is arbitrary.  But browsers that lack charCode
      // seem to put character info in keyCode.
      // (foo == null) tests for null or undefined
      if (event.which == null)
	event.which = (event.charCode != null ? event.charCode : event.keyCode);
    } else if (/^(?:mouse|contextmenu)|click/.test(type)) {
      // MOUSE EVENTS
      // Add relatedTarget, if necessary
      if (! event.relatedTarget && event.fromElement)
	event.relatedTarget = (event.fromElement === event.target ?
                               event.toElement : event.fromElement);
      // Add which for click: 1 === left; 2 === middle; 3 === right
      if (! event.which && event.button !== undefined ) {
        var button = event.button;
	event.which = (button & 1 ? 1 :
                       (button & 2 ? 3 :
                         (button & 4 ? 2 : 0 )));
      }
    }

    return event;
  };

  var deliver = function (event) {
    event = normalizeEvent(event);
    _.each(listeners, function (listener) {
      if (listener.types[event.type]) {
        // if in debug mode, filter out events where the user forgot
        // to call installHandler, even if we're not on IE
        if (!(listener._checkIECompliance &&
              ! event.currentTarget['_uevents_test_eventtype_' + event.type]))
          listener.handler.call(null, event);
      }
    });
  };

  // When IE8 is dead, we can remove this springboard logic.
  var impl;
  var getImpl = function () {
    if (! impl)
      impl = (document.addEventListener ?
              new UniversalEventListener._impl.w3c(deliver) :
              new UniversalEventListener._impl.ie(deliver));
    return impl;
  };

  var typeCounts = {};


  ////////// PUBLIC API

  // Create a new universal event listener with a given handler.
  // Until some event types are turned on with `addType`, the handler
  // will not receive any events.
  //
  // Whenever an event of the appropriate type fires anywhere in the
  // document, `handler` will be called with one argument, the
  // event. If the event is a bubbling event (most events are
  // bubbling, eg, 'click'), then `handler` will be called not only
  // for the element that was the origin of the event (eg, the button
  // that was clicked), but for each parent element as the event
  // bubbles up to the top of the tree.
  //
  // The event object that's passed to `handler` will be normalized
  // across browsers so that it contains the following fields and
  // methods:
  //
  // - type (e.g. "click")
  // - target
  // - currentTarget
  // - stopPropagation()
  // - preventDefault()
  // - isPropagationStopped()
  // - isDefaultPrevented()
  //
  // NOTE: If you want compatibility with IE <= 8, you will need to
  // call `installHandler` to prepare each subtree of the DOM to receive
  // the events you are interested in.
  //
  // Debugging only:
  //
  // The _checkIECompliance flag enables extra checking that the user
  // is correctly registering new DOM nodes with installHandler, even
  // in browsers that don't require it. In other words, when the flag
  // is set, modern browsers will require the same API calls as IE <=
  // 8. This is only used for tests and is private for now.
  UniversalEventListener = function (handler, _checkIECompliance) {
    this.handler = handler;
    this.types = {}; // map from event type name to 'true'
    this.impl = getImpl();
    this._checkIECompliance = _checkIECompliance;
    listeners.push(this);
  };

  _.extend(UniversalEventListener.prototype, {
    // Adds `type` to the set of event types that this listener will
    // listen to and deliver to the handler.  Has no effect if `type`
    // is already in the set.
    addType: function (type) {
      if (!this.types[type]) {
        this.types[type] = true;
        typeCounts[type] = (typeCounts[type] || 0) + 1;
        if (typeCounts[type] === 1)
          this.impl.addType(type);
      }
    },

    // Removes `type` from the set of event types that this listener
    // will listen to and deliver to the handler.  Has no effect if `type`
    // is not in the set.
    removeType: function (type) {
      if (this.types[type]) {
        delete this.types[type];
        typeCounts[type]--;
        if (! typeCounts[type])
          this.impl.removeType(type);
      }
    },

    // It is only necessary to call this method if you want to support
    // IE <= 8. On those browsers, you must call this method on each
    // set of nodes before adding them to the DOM (or at least, before
    // expecting to receive events on them), and you must specify the
    // types of events you'll be receiving.
    //
    // `node` and all of its descendents will be set up to handle
    // events of type `type` (eg, 'click'). Only current descendents
    // of `node` are affected; if new nodes are added to the subtree
    // later, installHandler must be called again to ensure events are
    // received on those nodes. To set up to handle multiple event
    // types, make multiple calls.
    //
    // It is safe to call installHandler any number of times on the same
    // arguments (it is idempotent).
    //
    // If you forget to call this function for a given node, it's
    // unspecified whether you'll receive events on IE <= 8 (you may,
    // you may not.) If you don't care about supporting IE <= 8 you
    // can ignore this function.
    installHandler: function (node, type) {
      // Only work on element nodes, not e.g. text nodes or fragments
      if (node.nodeType !== 1)
        return;
      this.impl.installHandler(node, type);

      // When in checkIECompliance mode, mark all the nodes in the current subtree.
      // We will later block events on nodes that weren't marked.  This
      // tests that Spark is generating calls to registerEventType
      // with proper subtree information, even in browsers that don't need
      // it.
      if (this._checkIECompliance) {
        // set flag to mark the node for this type, recording the
        // fact that installHandler was called for this node and type.
        // the property value can be any non-primitive value (to prevent
        // showing up as an HTML attribute in IE) so we use `node` itself.
        node['_uevents_test_eventtype_'+type] = node;
        if (node.firstChild) {
          _.each(node.getElementsByTagName('*'), function(x) {
            x['_uevents_test_eventtype_'+type] = x;
          });
        }
      }
    },

    // Tear down this UniversalEventListener so that no more events
    // are delivered.
    destroy: function () {
      var self = this;

      listeners = _.without(listeners, self);
      _.each(_.keys(self.types), function (type) {
        self.removeType(type);
      });
    }
  });
})();
