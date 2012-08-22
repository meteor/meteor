// Universal Events implementation that depends on the W3C event
// model, i.e. addEventListener and capturing.  It's intended for all
// browsers except IE <= 8.
//
// We take advantage of the fact that event handlers installed during
// the capture phase are live during the bubbling phase.  By installing
// a capturing listener on the document, we bind the handler to the
// event target and its ancestors "just in time".

(function () {
  var SIMULATE_NEITHER = 0;
  var SIMULATE_FOCUS_BLUR = 1;
  var SIMULATE_FOCUSIN_FOCUSOUT = 2;

  UniversalEventListener._impl = UniversalEventListener._impl ||  {};

  // Singleton
  UniversalEventListener._impl.w3c = function (deliver) {
    this.deliver = deliver;
    this.typeCounts = {}; // map from event type name to count

    this.boundHandler = _.bind(this.handler, this);
    this.boundCapturer = _.bind(this.capturer, this);

    // Focusin/focusout are the bubbling versions of focus/blur, and
    // are part of the W3C spec, but are absent from Firefox as of
    // today (v11), so we supply them.
    //
    // In addition, while most browsers fire these events sync in
    // response to a programmatic action (like .focus()), not all do.
    // IE 9+ fires focusin/focusout sync but focus/blur async.  Opera
    // fires them all async.  We don't do anything about this right
    // now, but simulating focus/blur on IE would make them sync.
    //
    // We have the capabiilty here to simulate focusin/focusout from
    // focus/blur, vice versa, or neither.
    //
    // We do a browser check that fails in old Firefox (3.6) but will
    // succeed if Firefox ever implements focusin/focusout.  Old
    // Firefox fails all tests of the form ('onfoo' in node), while
    // new Firefox and all other known browsers will pass if 'foo' is
    // a known event.
    this.focusBlurMode = ('onfocusin' in document.createElement("DIV")) ?
      SIMULATE_NEITHER : SIMULATE_FOCUSIN_FOCUSOUT;

    // mouseenter/mouseleave is non-bubbling mouseover/mouseout.  It's
    // standard but only IE and Opera seem to support it,
    // so we simulate it (which works in IE but not in Opera for some reason).
    this.simulateMouseEnterLeave = (! window.opera);
  };

  _.extend(UniversalEventListener._impl.w3c.prototype, {
    addType: function (eventType) {
      this._listen(this._expandEventType(eventType));
    },

    removeType: function (type) {
      this._unlisten(this._expandEventType(type));
    },

    installHandler: function (node, type) {
      // Unnecessary in w3c implementation
    },

    _expandEventType: function (type) {
      var ret = [type];

      // install handlers for the events used to fake events of this
      // type, in addition to handlers for the real type

      if (this.focusBlurMode === SIMULATE_FOCUS_BLUR) {
        if (type === 'focus')
          ret.push('focusin');
        else if (type === 'blur')
          ret.push('focusout');
      } else if (this.focusBlurMode === SIMULATE_FOCUSIN_FOCUSOUT) {
        if (type === 'focusin')
          ret.push('focus');
        else if (type === 'focusout')
          ret.push('blur');
      }
      if (this.simulateMouseEnterLeave) {
        if (type === 'mouseenter')
          ret.push('mouseover');
        else if (type === 'mouseleave')
          ret.push('mouseout');
      }

      return ret;
    },

    _listen: function (types) {
      var self = this;
      _.each(types, function (type) {
        if ((self.typeCounts[type] = (self.typeCounts[type] || 0) + 1) === 1)
          document.addEventListener(type, self.boundCapturer, true);
      });
    },

    _unlisten: function (types) {
      var self = this;
      _.each(types, function (type) {
        if (!(--self.typeCounts[type])) {
          document.removeEventListener(type, self.boundCapturer, true);
        }
      });
    },

    capturer: function (event) {
      if (event.target.nodeType === 3) // fix text-node target
        event.target = event.target.parentNode;

      var type = event.type;
      var bubbles = event.bubbles;
      var target = event.target;

      target.addEventListener(type, this.boundHandler, false);

      // According to the DOM event spec, if the DOM is mutated during
      // event handling, the original bubbling order still applies.
      // So we can determine the chain of nodes that could possibly
      // be bubbled to right now.
      var ancestors;
      if (bubbles) {
        ancestors = [];
        for(var n = target.parentNode; n; n = n.parentNode) {
          n.addEventListener(type, this.boundHandler, false);
          ancestors.push(n);
        };
      }

      // Unbind the handlers later.
      setTimeout(function() {
        target.removeEventListener(type, this.boundHandler, false);
        if (bubbles) {
          _.each(ancestors, function(n) {
            n.removeEventListener(type, this.boundHandler, false);
          });
        };
      }, 0);
    },

    handler: function (event) {
      var sendUIEvent = function (type, target, bubbles, cancelable, detail) {
        var evt = document.createEvent("UIEvents");
        evt.initUIEvent(type, bubbles, cancelable, window, detail);
        evt.synthetic = true;
        target.dispatchEvent(evt);
      };

      // fire synthetic focusin/focusout on blur/focus or vice versa
      if (event.currentTarget === event.target) {
        if (this.focusBlurMode === SIMULATE_FOCUS_BLUR) {
          if (event.type === 'focusin')
            sendUIEvent('focus', event.target, false);
          else if (event.type === 'focusout')
            sendUIEvent('blur', event.target, false);
        } else if (this.focusBlurMode === SIMULATE_FOCUSIN_FOCUSOUT) {
          if (event.type === 'focus')
            sendUIEvent('focusin', event.target, true);
          else if (event.type === 'blur')
            sendUIEvent('focusout', event.target, true);
        }
      }
      // only respond to synthetic events of the types we are faking
      if (this.focusBlurMode === SIMULATE_FOCUS_BLUR) {
        if (event.type === 'focus' || event.type === 'blur') {
          if (! event.synthetic)
            return;
        }
      } else if (this.focusBlurMode === SIMULATE_FOCUSIN_FOCUSOUT) {
        if (event.type === 'focusin' || event.type === 'focusout') {
          if (! event.synthetic)
            return;
        }
      }
      if (this.simulateMouseEnterLeave) {
        if (event.type === 'mouseenter' || event.type === 'mouseleave') {
          if (! event.synthetic)
            return;
        }
      }

      this.deliver(event);

      // event ordering: fire mouseleave after mouseout
      if (this.simulateMouseEnterLeave &&
          // We respond to mouseover/mouseout here even on
          // bubble, i.e. when event.currentTarget !== event.target,
          // to ensure we see every enter and leave.
          // We ignore the case where the mouse enters from
          // a child or leaves to a child (by checking if
          // relatedTarget is present and a descendent).
          (! event.relatedTarget ||
           (event.currentTarget !== event.relatedTarget &&
            ! DomUtils.elementContains(
              event.currentTarget, event.relatedTarget)))) {
        if (event.type === 'mouseover'){
          sendUIEvent('mouseenter', event.currentTarget, false);
        }
        else if (event.type === 'mouseout') {
          sendUIEvent('mouseleave', event.currentTarget, false);
        }
      }
    }
  });

})();
