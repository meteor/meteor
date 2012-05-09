Meteor.ui = Meteor.ui || {};
Meteor.ui._event = Meteor.ui._event || {};

// For IE 6-8.

Meteor.ui._event._loadNoW3CImpl = function() {

  var installOne = function(node, prop) {
    // install handlers for faking focus/blur if necessary
    if (prop === 'onfocus')
      installOne(node, 'onfocusin');
    else if (prop === 'onblur')
      installOne(node, 'onfocusout');
    // install handlers for faking bubbling change/submit
    else if (prop === 'onchange') {
      installOne(node, 'oncellchange');
      if (node.nodeName === 'INPUT' &&
          (node.type === 'checkbox' || node.type === 'radio')) {
        installOne(node, 'onpropertychange');
        return;
      }
    } else if (prop === 'onsubmit')
      installOne(node, 'ondatasetcomplete');

    node[prop] = universalHandler;
  };

  Meteor.ui._event.registerEventType = function(eventType, subtreeRoot) {
    // use old-school event binding, so that we can
    // access the currentTarget as `this` in the handler.
    var prop = 'on'+eventType;

    if (subtreeRoot.nodeType === 1) { // ELEMENT
      installOne(subtreeRoot, prop);

      var descendents = subtreeRoot.getElementsByTagName('*');

      for(var i=0, N = descendents.length; i<N; i++)
        installOne(descendents[i], prop);
    }
  };

  var sendEvent = function(ontype, target) {
    var e = document.createEventObject();
    e.synthetic = true;
    target.fireEvent(ontype, e);
    return e.returnValue;
  };

  var universalHandler = function() {
    var event = window.event;
    var type = event.type;
    var target = event.srcElement || document;
    event.target = target;
    if (this.nodeType !== 1)
      return; // sanity check that we have a real target (always an element)
    event.currentTarget = this;
    var curNode = this;

    // simulate focus/blur so that they are synchronous
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

    if (type === 'cellchange' && event.synthetic) {
      type = event.type = 'change';
    }
    if (type === 'datasetcomplete' && event.synthetic) {
      type = event.type = 'submit';
    }

    Meteor.ui._event._eventDispatchFunc(event);
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
