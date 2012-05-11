Meteor.ui = Meteor.ui || {};
Meteor.ui._event = Meteor.ui._event || {};

// LiveEvents implementation that depends on the W3C event model,
// i.e. addEventListener and capturing.  It's intended for all
// browsers except IE <= 8.
//
// We take advantage of the fact that event handlers installed during
// the capture phase are live during the bubbling phase.  By installing
// a capturing listener on the document, we bind the handler to the
// event target and its ancestors "just in time".

Meteor.ui._event._loadW3CImpl = function() {
  var SIMULATE_NEITHER = 0;
  var SIMULATE_FOCUS_BLUR = 1;
  var SIMULATE_FOCUSIN_FOCUSOUT = 2;

  // Focusin/focusout are the bubbling versions of focus/blur, and are
  // part of the W3C spec, but are absent from Firefox as of today
  // (v11), so we supply them.
  //
  // In addition, while most browsers fire these events sync in
  // response to a programmatic action (like .focus()), not all do.
  // IE 9+ fires focusin/focusout sync but focus/blur async.  Opera
  // fires them all async.  We don't do anything about this right now,
  // but simulating focus/blur on IE would make them sync.
  //
  // We have the capabiilty here to simulate focusin/focusout from
  // focus/blur, vice versa, or neither.
  //
  // We do a browser check that fails in old Firefox (3.6) but will
  // succeed if Firefox ever implements focusin/focusout.  Old Firefox
  // fails all tests of the form ('onfoo' in node), while new Firefox
  // and all other known browsers will pass if 'foo' is a known event.
  var focusBlurMode = ('onfocusin' in document.createElement("DIV")) ?
        SIMULATE_NEITHER : SIMULATE_FOCUSIN_FOCUSOUT;

  // mouseenter/mouseleave is non-bubbling mousein/mouseout.  It's
  // standard but only IE and Opera seem to support it,
  // so we simulate it (which works in IE but not in Opera for some reason).
  var simulateMouseEnterLeave = (! window.opera);

  var universalCapturer = function(event) {
    if (event.target.nodeType === 3) // fix text-node target
      event.target = event.target.parentNode;

    var type = event.type;
    var bubbles = event.bubbles;
    var target = event.target;

    target.addEventListener(type, universalHandler, false);

    // According to the DOM event spec, if the DOM is mutated during
    // event handling, the original bubbling order still applies.
    // So we can determine the chain of nodes that could possibly
    // be bubbled to right now.
    var ancestors;
    if (bubbles) {
      ancestors = [];
      for(var n = target.parentNode; n; n = n.parentNode) {
        n.addEventListener(type, universalHandler, false);
        ancestors.push(n);
      };
    }

    // Unbind the handlers later.
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
      } else if (focusBlurMode === SIMULATE_FOCUSIN_FOCUSOUT) {
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
    } else if (focusBlurMode === SIMULATE_FOCUSIN_FOCUSOUT) {
      if (event.type === 'focusin' || event.type === 'focusout') {
        if (! event.synthetic)
          return;
      }
    }
    if (simulateMouseEnterLeave) {
      if (event.type === 'mouseenter' || event.type === 'mouseleave') {
        if (! event.synthetic)
          return;
      }
    }

    Meteor.ui._event._handleEventFunc(
      Meteor.ui._event._fixEvent(event));

    // fire mouseleave after mouseout
    if (simulateMouseEnterLeave &&
        (event.currentTarget === event.target)) {
      if (event.type === 'mousein')
        sendUIEvent('mouseenter', event.target, false);
      else if (event.type === 'mouseout') {
        sendUIEvent('mouseleave', event.target, false);
      }
    }
  };

  var installCapturer = function(eventType) {
    // install handlers for the events used to fake events of this type,
    // in addition to handlers for the real type
    if (focusBlurMode === SIMULATE_FOCUS_BLUR) {
      if (eventType === 'focus')
        installCapturer('focusin');
      else if (eventType === 'blur')
        installCapturer('focusout');
    } else if (focusBlurMode === SIMULATE_FOCUSIN_FOCUSOUT) {
      if (eventType === 'focusin')
        installCapturer('focus');
      else if (eventType === 'focusout')
        installCapturer('blur');
    }
    if (simulateMouseEnterLeave) {
      if (eventType === 'mouseenter')
        installCapturer('mousein');
      else if (eventType === 'mouseleave')
        installCapturer('mouseout');
    }

    if (! eventsCaptured[eventType]) {
      // only bind one event capturer per type
      eventsCaptured[eventType] = true;
      document.addEventListener(eventType, universalCapturer, true);
    }
  };

  var eventsCaptured = {};

  Meteor.ui._event.registerEventType = function(eventType, subtreeRoot) {
    // We capture on the entire document, so don't actually care
    // about subtreeRoot!
    installCapturer(eventType);
  };

};