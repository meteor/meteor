// Universal Events implementation for IE versions 6-8, which lack
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

UniversalEventListener._impl = UniversalEventListener._impl ||  {};

// Singleton
UniversalEventListener._impl.ie = function (deliver) {
  var self = this;
  this.deliver = deliver;
  this.curriedHandler = function () {
    self.handler.call(this, self);
  };

  // The 'submit' event on IE doesn't bubble.  We want to simulate
  // bubbling submit to match other browsers, and to do that we use
  // IE's own event machinery.  We can't dispatch events with arbitrary
  // names in IE, so we appropriate the obscure "datasetcomplete" event
  // for this purpose.
  document.attachEvent('ondatasetcomplete', function () {
    var evt = window.event;
    var target = evt && evt.srcElement;
    if (evt.synthetic && target &&
        target.nodeName === 'FORM' &&
        evt.returnValue !== false)
      // No event handler called preventDefault on the simulated
      // submit event.  That means the form should be submitted.
      target.submit();
  });
};

_.extend(UniversalEventListener._impl.ie.prototype, {
  addType: function (type) {
    // not necessary for IE
  },

  removeType: function (type) {
    // not necessary for IE
  },

  installHandler: function (node, type) {
    // use old-school event binding, so that we can
    // access the currentTarget as `this` in the handler.
    // note: handler is never removed from node
    var prop = 'on' + type;

    if (node.nodeType === 1) { // ELEMENT
      this._install(node, prop);

      // hopefully fast traversal, since the browser is doing it
      var descendents = node.getElementsByTagName('*');

      for(var i=0, N = descendents.length; i<N; i++)
        this._install(descendents[i], prop);
    }
  },

  _install: function (node, prop) {
    var props = [prop];

    // install handlers for faking focus/blur if necessary
    if (prop === 'onfocus')
      props.push('onfocusin');
    else if (prop === 'onblur')
      props.push('onfocusout');
    // install handlers for faking bubbling change/submit
    else if (prop === 'onchange') {
      // if we're looking at a checkbox or radio button,
      // sign up for propertychange and NOT change
      if (node.nodeName === 'INPUT' &&
          (node.type === 'checkbox' || node.type === 'radio'))
        props = ['onpropertychange'];
      props.push('oncellchange');
    } else if (prop === 'onsubmit')
      props.push('ondatasetcomplete');

    for(var i = 0; i < props.length; i++)
      node[props[i]] = this.curriedHandler;
  },

  // This is the handler we assign to DOM nodes, so it shouldn't close over
  // anything that would create a circular reference leading to a memory leak.
  //
  // This handler is called via this.curriedHandler. When it is called:
  //  - 'this' is the node currently handling the event (set by IE)
  //  - 'self' is what would normally be 'this'
  handler: function (self) {
    var sendEvent = function (ontype, target) {
      var e = document.createEventObject();
      e.synthetic = true;
      target.fireEvent(ontype, e);
      return e.returnValue;
    };


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
    if ((type === 'focus' || event.type === 'blur'
         || event.type === 'change' ||
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

    self.deliver(event);
  }

});
