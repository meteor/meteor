Meteor.ui = Meteor.ui || {};
Meteor.ui._event = Meteor.ui._event || {};

// LiveEvents implementation for "old IE" versions 6-8, which lack
// addEventListener and event capturing.
//
// The strategy is very different.  We walk the subtree in question
// and just attach the handler to all elements.  If the handler is
// foo and the eventType is 'click', we assign node.onclick = foo
// everywhere.  Since there is only one function object and we are
// just assigning a property, hopefully this is somewhat lightweight.
//
// We use the node.onfoo method of binding events, also called "DOM0"
// or the "traditional event registration", rather than the IE-native
// node.attachEvent(...), mainly because we have the benefit of
// referring to `this` from the handler in order to populate
// event.currentTarget.  It seems that otherwise we'd have to create
// a closure per node to remember what node we are handling.
//
// We polyfill the usual event properties from their various locations.
// We also make 'change' and 'submit' bubble, and we fire 'change'
// events on checkboxes and radio buttons immediately rather than
// only when the user blurs them, another old IE quirk.

Meteor.ui._event._loadNoW3CImpl = function() {

  var installHandler = function(node, prop) {
    // install handlers for faking focus/blur if necessary
    if (prop === 'onfocus')
      installHandler(node, 'onfocusin');
    else if (prop === 'onblur')
      installHandler(node, 'onfocusout');
    // install handlers for faking bubbling change/submit
    else if (prop === 'onchange') {
      installHandler(node, 'oncellchange');
      // if we're looking at a checkbox or radio button,
      // sign up for propertychange and NOT change
      if (node.nodeName === 'INPUT' &&
          (node.type === 'checkbox' || node.type === 'radio')) {
        installHandler(node, 'onpropertychange');
        return;
      }
    } else if (prop === 'onsubmit')
      installHandler(node, 'ondatasetcomplete');

    node[prop] = universalHandler;
  };

  Meteor.ui._event.registerEventType = function(eventType, subtreeRoot) {
    // use old-school event binding, so that we can
    // access the currentTarget as `this` in the handler.
    var prop = 'on'+eventType;

    if (subtreeRoot.nodeType === 1) { // ELEMENT
      installHandler(subtreeRoot, prop);

      // hopefully fast traversal, since the browser is doing it
      var descendents = subtreeRoot.getElementsByTagName('*');

      for(var i=0, N = descendents.length; i<N; i++)
        installHandler(descendents[i], prop);
    }
  };

  var sendEvent = function(ontype, target) {
    var e = document.createEventObject();
    e.synthetic = true;
    target.fireEvent(ontype, e);
    return e.returnValue;
  };

  // This is the handler we assign to DOM nodes, so it shouldn't close over
  // anything that would create a circular reference leading to a memory leak.
  var universalHandler = function() {
    var event = window.event;
    var type = event.type;
    var target = event.srcElement || document;
    event.target = target;
    if (this.nodeType !== 1)
      return; // sanity check that we have a real target (always an element)
    event.currentTarget = this;
    var curNode = this;

    // simulate focus/blur so that they are synchronous;
    // simulate change/submit so that they bubble.
    // The IE-specific 'cellchange' and 'datasetcomplete' events actually
    // have nothing to do with change and submit, we are just using them
    // as dummy events because we need event types that IE considers real
    // (and apps are unlikely to use them).
    if (curNode === target && ! event.synthetic) {
      if (type === 'focusin')
        sendEvent('onfocus', curNode);
      else if (type === 'focusout')
        sendEvent('onblur', curNode);
      else if (type === 'change')
        sendEvent('oncellchange', curNode);
      else if (type === 'propertychange') {
        if (event.propertyName === 'checked')
          sendEvent('oncellchange', curNode);
      } else if (type === 'submit') {
        sendEvent('ondatasetcomplete', curNode);
      }
    }
    // ignore non-simulated events of types we simulate
    if ((type === 'focus' || event.type === 'blur' || event.type === 'change' ||
         event.type === 'submit') && ! event.synthetic) {
      if (event.type === 'submit')
        event.returnValue = false; // block all native submits, we will submit
      return;
    }

    // morph the event
    if (type === 'cellchange' && event.synthetic) {
      type = event.type = 'change';
    }
    if (type === 'datasetcomplete' && event.synthetic) {
      type = event.type = 'submit';
    }

    Meteor.ui._event._handleEventFunc(
      Meteor.ui._event._fixEvent(event));
  };

  // submit forms that aren't preventDefaulted
  document.attachEvent('ondatasetcomplete', function() {
    var evt = window.event;
    var target = evt && evt.srcElement;
    if (evt.synthetic && target &&
        target.nodeName === 'FORM' &&
        evt.returnValue !== false)
      target.submit();
  });

};
