Meteor.ui = Meteor.ui || {};
Meteor.ui._event = Meteor.ui._event || {};

// LiveEvents -- Normalized cross-browser event handling library
//
// This module lets you set up a function f that will be called
// whenever an event fires on any node in the DOM. Specifically, when
// an event fires on node N, f will be called with N. Then, if the
// event is a bubbling event, f will be called again with N's parent,
// then called again with N's grandparent, etc, until the root of the
// document is reached. This provides a good base on top of which
// custom event handling semantics can be implemented.
//
// f also receives the event object for the event that fired. The
// event object is normalized and extended to smooth over
// cross-browser differences in event handling. See the details in
// setHandler.
//
// To use, first call setHandler to set the handler function. (There
// can be only one.) After that, it's necessary to call
// registerEventType to indicate what events you'll be handling and
// where in the document they could occur. setHandler and
// registerEventType are the only public functions.
//
// Internally, there are two separate implementations, one for modern
// browsers (in liveevents_w3c.js), and one for old browsers with no
// event capturing support (in liveevents_now3c.js.) The correct
// implementation will be chosen for you automatically at runtime.

(function() {

  // Install the global event handler. After this function has been
  // done, handleEventFunc(event) will be called whenever a DOM event
  // fires or bubbles to a new node.
  //
  // 'event' will be a normalized version of the DOM event
  // object. Some of the properties that are normalized include:
  // - type
  // - target
  // - currentTarget
  // - stopPropagation()
  // - preventDefault()
  // - isPropagationStopped()
  // - isDefaultPrevented()
  //
  // This function should only be called once, ever, and must be
  // called before registerEventType.
  Meteor.ui._event.setHandler = function(handleEventFunc) {

    Meteor.ui._event._handleEventFunc = function(event) {
      // When in unit test mode, wrap the given handleEventFunc to
      // block events we didn't register for explicitly.
      // See description of this flag in liveevents_tests.js.
      if (Meteor.ui._TEST_requirePreciseEventHandlers) {
        if (! event.currentTarget['_liveui_test_eventtype_'+event.type])
          return;
      }

      handleEventFunc(event);
    };
  };

  // After calling setHandler, this function must be called some
  // number of times to enable handling of different events at
  // different points in the document.
  //
  // Specifically, calling this function will ensure that events of
  // type eventType will be successfully caught when they occur within
  // the DOM subtree rooted at subtreeRoot (i.e. subtreeRoot and its
  // descendents).  Only the current descendents are registered.
  // If new nodes are added to the subtree later, they must be
  // registered.
  //
  // If this function isn't called for a given event type T and
  // subtree S, and T fires within S, then it's unspecified whether
  // handleEventFunc will be called. (In browsers where we are able to
  // catch events for the entire document using a capturing handler,
  // it will be called. In browsers that don't support this, the event
  // will be lost.)
  Meteor.ui._event.registerEventType = function(eventType, subtreeRoot) {
    // Only work on element nodes, not e.g. text nodes or fragments
    if (subtreeRoot.nodeType !== 1)
      return;

    Meteor.ui._event.registerEventTypeImpl(eventType, subtreeRoot);

    // When in unit test mode, mark all the nodes in the current subtree.
    // We will later block events on nodes that weren't marked.  This
    // tests that LiveUI is generating calls to registerEventType
    // with proper subtree information, even in browsers that don't need
    // it.
    // See description of this flag in liveevents_tests.js.
    if (Meteor.ui._TEST_requirePreciseEventHandlers) {
      var n = subtreeRoot, t = eventType;
      // set property to any non-primitive value (to prevent showing
      // up as an HTML attribute in IE)
      n['_liveui_test_eventtype_'+t] = n;
      if (n.firstChild) {
        _.each(n.getElementsByTagName('*'), function(x) {
          x['_liveui_test_eventtype_'+t] = x;
        });
      }
    }
  };

  Meteor.ui._event.registerEventTypeImpl = null; // overridden by impls


  // inspired by jquery fix()
  Meteor.ui._event._fixEvent = function(event) {
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

  var returnFalse = function() { return false; };
  var returnTrue = function() { return true; };

  if (! document.addEventListener)
    Meteor.ui._event._loadNoW3CImpl(); // IE 6-8
  else
    Meteor.ui._event._loadW3CImpl(); // IE 9-10, WebKit, Firefox, Opera

})();