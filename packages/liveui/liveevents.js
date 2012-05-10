Meteor.ui = Meteor.ui || {};
Meteor.ui._event = Meteor.ui._event || {};

(function() {

  Meteor.ui._event.setHandler = function(handleEventFunc) {
    Meteor.ui._event._handleEventFunc = handleEventFunc;
  };

  // Prototype, implemented by W3C and NoW3C impls.
  Meteor.ui._event.registerEventType = function(eventType, subtreeRoot) {};

  // inspired by jQuery fix()
  Meteor.ui._event.fixEvent = function(event) {
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

    if (event.metaKey === undefined)
      event.metaKey = event.ctrlKey;
    if (/^key/.test(type)) {
      // KEY EVENTS
      // Add `which`
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