Meteor.ui = Meteor.ui || {};
Meteor.ui._event = Meteor.ui._event || {};


Meteor.ui._event._loadW3CImpl = function() {
  var SIMULATE_FOCUS_BLUR = 1;
  var SIMULATE_FOCUSIN_FOCUSOUT = 2;

  // If we have focusin/focusout, use them to simulate focus/blur.
  // This has the nice effect of making focus/blur synchronous in IE 9+.
  // It doesn't work in Firefox, which lacks focusin/focusout completely
  // as of v11.0.  This style of event support testing ('onfoo' in div)
  // doesn't work in Firefox 3.6, but does in IE and WebKit.
  var focusBlurMode = ('onfocusin' in document.createElement("DIV")) ?
        SIMULATE_FOCUS_BLUR : SIMULATE_FOCUSIN_FOCUSOUT;

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

  var universalHandler = function(event) {
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
          return;
      }
    } else { // SIMULATE_FOCUSIN_FOCUSOUT
      if (event.type === 'focusin' || event.type === 'focusout') {
        if (! event.synthetic)
          return;
      }
    }

    Meteor.ui._event._eventDispatchFunc(event);
  };

  var installCapturer = function(eventType) {
    // install handlers for the events used to fake events of this type,
    // in addition to handlers for the real type
    if (focusBlurMode === SIMULATE_FOCUS_BLUR) {
      if (eventType === 'focus')
        installCapturer('focusin');
      else if (eventType === 'blur')
        installCapturer('focusout');
    } else { // SIMULATE_FOCUSIN_FOCUSOUT
      if (eventType === 'focusin')
        installCapturer('focus');
      else if (eventType === 'focusout')
        installCapturer('blur');
    }

    if (! eventsCaptured[eventType]) {
      // only bind one event capturer per type
      eventsCaptured[eventType] = true;
      document.addEventListener(eventType, universalCapturer, true);
    }
  };

  var eventsCaptured = {};

  Meteor.ui._event.registerEventType = function(eventType, subtreeRoot) {
    installCapturer(eventType);
  };

};