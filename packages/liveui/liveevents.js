Meteor.ui = Meteor.ui || {};
Meteor.ui._event = Meteor.ui._event || {};

// LiveEvents simulates binding an event listener to every node in the
// DOM in a cross-browser way.  This allows the caller to take
// arbitrary action when an event fires and when it bubbles to each
// parent node.
//
// There can be only one global handler for the entire DOM.  The
// purpose of LiveEvents is to normalize what events are fired for a
// given user action and how they bubble, and to provide hooks into
// browser event handling.
//
// Use registerEventType to specify the event types and DOM regions
// to listen to.

(function() {

  // Install the global event handler.  handleEventFunc(event) is called
  // when an event fires or bubbles to a new node.
  //
  // Various properties and methods of the event are normalized, including:
  // - type
  // - target
  // - currentTarget
  // - stopPropagation()
  // - preventDefault()
  // - isPropagationStopped()
  // - isDefaultPrevented()
  //
  // setHandler is intended to be called once ever,
  // before calling registerEventType.
  Meteor.ui._event.setHandler = function(handleEventFunc) {
    Meteor.ui._event._handleEventFunc = handleEventFunc;
  };

  // Ensure delivery of events of type eventType on the DOM subtree
  // rooted at subtreeRoot (i.e. subtreeRoot and its descendents).
  //
  // LiveEvents will deliver events on the entire document if it can,
  // but some browsers make this difficult, in which case only nodes
  // in the subtree are guaranteed to be listened on.

  Meteor.ui._event.registerEventType = function(eventType, subtreeRoot) {
    // Prototype, implemented by W3C and NoW3C impls.
    throw new Error("no subclass");
  };


  // inspired by jquery fix()
  Meteor.ui._event._fixEvent = function(event) {
    var originalStopPropagation = event.stopPropagation;
    var originalPreventDefault = event.preventDefault;
    event.isPropagationStopped = returnFalse;
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
      if (event.which === null)
	event.which = event.charCode !== null ? event.charCode : event.keyCode;
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