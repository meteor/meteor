(function () {

////////////////////////////////////////////////////////////////////////////////////
//                                                                                //
// packages/universal-events/listener.js                                          //
//                                                                                //
////////////////////////////////////////////////////////////////////////////////////
                                                                                  //
// Meteor Universal Events -- Normalized cross-browser event handling library     // 1
//                                                                                // 2
// This module lets you set up a function f that will be called                   // 3
// whenever an event fires on any element in the DOM. Specifically,               // 4
// when an event fires on node N, f will be called with N. Then, if               // 5
// the event is a bubbling event, f will be called again with N's                 // 6
// parent, then called again with N's grandparent, etc, until the root            // 7
// of the document is reached. This provides a good base on top of                // 8
// which custom event handling systems can be implemented.                        // 9
//                                                                                // 10
// f also receives the event object for the event that fired. The                 // 11
// event object is normalized and extended to smooth over                         // 12
// cross-browser differences in event handling. See the details in                // 13
// setHandler.                                                                    // 14
//                                                                                // 15
// Usage:                                                                         // 16
//   var listener = new UniversalEventListener(function (event) { ... });         // 17
//   listener.addType("click");                                                   // 18
//                                                                                // 19
// If you want to support IE <= 8, you must also call installHandler              // 20
// on each subtree of DOM nodes on which you wish to receive events,              // 21
// eg, before inserting them into the document.                                   // 22
//                                                                                // 23
// Universal Events works reliably for events that fire on any DOM                // 24
// element. It may not work consistently across browsers for events               // 25
// that are intended to fire on non-element nodes (eg, text nodes).               // 26
// We're not sure if it's possible to handle those events consistently            // 27
// across browsers, but in any event, it's not a common use case.                 // 28
//                                                                                // 29
// Implementation notes:                                                          // 30
//                                                                                // 31
// Internally, there are two separate implementations, one for modern             // 32
// browsers (in events-w3c.js), and one for old browsers with no                  // 33
// event capturing support (in events-ie.js.) The correct                         // 34
// implementation will be chosen for you automatically at runtime.                // 35
                                                                                  // 36
var listeners = [];                                                               // 37
                                                                                  // 38
var returnFalse = function() { return false; };                                   // 39
var returnTrue = function() { return true; };                                     // 40
                                                                                  // 41
// inspired by jquery fix()                                                       // 42
var normalizeEvent = function (event) {                                           // 43
  var originalStopPropagation = event.stopPropagation;                            // 44
  var originalPreventDefault = event.preventDefault;                              // 45
  event.isPropagationStopped = returnFalse;                                       // 46
  event.isImmediatePropagationStopped = returnFalse;                              // 47
  event.isDefaultPrevented = returnFalse;                                         // 48
  event.stopPropagation = function() {                                            // 49
    event.isPropagationStopped = returnTrue;                                      // 50
    if (originalStopPropagation)                                                  // 51
      originalStopPropagation.call(event);                                        // 52
    else                                                                          // 53
      event.cancelBubble = true; // IE                                            // 54
  };                                                                              // 55
  event.preventDefault = function() {                                             // 56
    event.isDefaultPrevented = returnTrue;                                        // 57
    if (originalPreventDefault)                                                   // 58
      originalPreventDefault.call(event);                                         // 59
    else                                                                          // 60
      event.returnValue = false; // IE                                            // 61
  };                                                                              // 62
  event.stopImmediatePropagation = function() {                                   // 63
    event.stopPropagation();                                                      // 64
    event.isImmediatePropagationStopped = returnTrue;                             // 65
  };                                                                              // 66
                                                                                  // 67
  var type = event.type;                                                          // 68
                                                                                  // 69
  // adapted from jquery                                                          // 70
  if (event.metaKey === undefined)                                                // 71
    event.metaKey = event.ctrlKey;                                                // 72
  if (/^key/.test(type)) {                                                        // 73
    // KEY EVENTS                                                                 // 74
    // Add which.  Technically char codes and key codes are                       // 75
    // different things; the former is ASCII/unicode/etc and the                  // 76
    // latter is arbitrary.  But browsers that lack charCode                      // 77
    // seem to put character info in keyCode.                                     // 78
    // (foo == null) tests for null or undefined                                  // 79
    if (event.which == null)                                                      // 80
      event.which = (event.charCode != null ? event.charCode : event.keyCode);    // 81
  } else if (/^(?:mouse|contextmenu)|click/.test(type)) {                         // 82
    // MOUSE EVENTS                                                               // 83
    // Add relatedTarget, if necessary                                            // 84
    if (! event.relatedTarget && event.fromElement)                               // 85
      event.relatedTarget = (event.fromElement === event.target ?                 // 86
                             event.toElement : event.fromElement);                // 87
    // Add which for click: 1 === left; 2 === middle; 3 === right                 // 88
    if (! event.which && event.button !== undefined ) {                           // 89
      var button = event.button;                                                  // 90
      event.which = (button & 1 ? 1 :                                             // 91
                     (button & 2 ? 3 :                                            // 92
                       (button & 4 ? 2 : 0 )));                                   // 93
    }                                                                             // 94
  }                                                                               // 95
                                                                                  // 96
  return event;                                                                   // 97
};                                                                                // 98
                                                                                  // 99
var deliver = function (event) {                                                  // 100
  event = normalizeEvent(event);                                                  // 101
  _.each(listeners, function (listener) {                                         // 102
    if (listener.types[event.type]) {                                             // 103
      // if in debug mode, filter out events where the user forgot                // 104
      // to call installHandler, even if we're not on IE                          // 105
      if (!(listener._checkIECompliance &&                                        // 106
            ! event.currentTarget['_uevents_test_eventtype_' + event.type]))      // 107
        listener.handler.call(null, event);                                       // 108
    }                                                                             // 109
  });                                                                             // 110
};                                                                                // 111
                                                                                  // 112
// When IE8 is dead, we can remove this springboard logic.                        // 113
var impl;                                                                         // 114
var getImpl = function () {                                                       // 115
  if (! impl)                                                                     // 116
    impl = (document.addEventListener ?                                           // 117
            new UniversalEventListener._impl.w3c(deliver) :                       // 118
            new UniversalEventListener._impl.ie(deliver));                        // 119
  return impl;                                                                    // 120
};                                                                                // 121
                                                                                  // 122
var typeCounts = {};                                                              // 123
                                                                                  // 124
                                                                                  // 125
////////// PUBLIC API                                                             // 126
                                                                                  // 127
// Create a new universal event listener with a given handler.                    // 128
// Until some event types are turned on with `addType`, the handler               // 129
// will not receive any events.                                                   // 130
//                                                                                // 131
// Whenever an event of the appropriate type fires anywhere in the                // 132
// document, `handler` will be called with one argument, the                      // 133
// event. If the event is a bubbling event (most events are                       // 134
// bubbling, eg, 'click'), then `handler` will be called not only                 // 135
// for the element that was the origin of the event (eg, the button               // 136
// that was clicked), but for each parent element as the event                    // 137
// bubbles up to the top of the tree.                                             // 138
//                                                                                // 139
// The event object that's passed to `handler` will be normalized                 // 140
// across browsers so that it contains the following fields and                   // 141
// methods:                                                                       // 142
//                                                                                // 143
// - type (e.g. "click")                                                          // 144
// - target                                                                       // 145
// - currentTarget                                                                // 146
// - stopPropagation()                                                            // 147
// - preventDefault()                                                             // 148
// - isPropagationStopped()                                                       // 149
// - isDefaultPrevented()                                                         // 150
//                                                                                // 151
// NOTE: If you want compatibility with IE <= 8, you will need to                 // 152
// call `installHandler` to prepare each subtree of the DOM to receive            // 153
// the events you are interested in.                                              // 154
//                                                                                // 155
// Debugging only:                                                                // 156
//                                                                                // 157
// The _checkIECompliance flag enables extra checking that the user               // 158
// is correctly registering new DOM nodes with installHandler, even               // 159
// in browsers that don't require it. In other words, when the flag               // 160
// is set, modern browsers will require the same API calls as IE <=               // 161
// 8. This is only used for tests and is private for now.                         // 162
UniversalEventListener = function (handler, _checkIECompliance) {                 // 163
  this.handler = handler;                                                         // 164
  this.types = {}; // map from event type name to 'true'                          // 165
  this.impl = getImpl();                                                          // 166
  this._checkIECompliance = _checkIECompliance;                                   // 167
  listeners.push(this);                                                           // 168
};                                                                                // 169
                                                                                  // 170
_.extend(UniversalEventListener.prototype, {                                      // 171
  // Adds `type` to the set of event types that this listener will                // 172
  // listen to and deliver to the handler.  Has no effect if `type`               // 173
  // is already in the set.                                                       // 174
  addType: function (type) {                                                      // 175
    if (!this.types[type]) {                                                      // 176
      this.types[type] = true;                                                    // 177
      typeCounts[type] = (typeCounts[type] || 0) + 1;                             // 178
      if (typeCounts[type] === 1)                                                 // 179
        this.impl.addType(type);                                                  // 180
    }                                                                             // 181
  },                                                                              // 182
                                                                                  // 183
  // Removes `type` from the set of event types that this listener                // 184
  // will listen to and deliver to the handler.  Has no effect if `type`          // 185
  // is not in the set.                                                           // 186
  removeType: function (type) {                                                   // 187
    if (this.types[type]) {                                                       // 188
      delete this.types[type];                                                    // 189
      typeCounts[type]--;                                                         // 190
      if (! typeCounts[type])                                                     // 191
        this.impl.removeType(type);                                               // 192
    }                                                                             // 193
  },                                                                              // 194
                                                                                  // 195
  // It is only necessary to call this method if you want to support              // 196
  // IE <= 8. On those browsers, you must call this method on each                // 197
  // set of nodes before adding them to the DOM (or at least, before              // 198
  // expecting to receive events on them), and you must specify the               // 199
  // types of events you'll be receiving.                                         // 200
  //                                                                              // 201
  // `node` and all of its descendents will be set up to handle                   // 202
  // events of type `type` (eg, 'click'). Only current descendents                // 203
  // of `node` are affected; if new nodes are added to the subtree                // 204
  // later, installHandler must be called again to ensure events are              // 205
  // received on those nodes. To set up to handle multiple event                  // 206
  // types, make multiple calls.                                                  // 207
  //                                                                              // 208
  // It is safe to call installHandler any number of times on the same            // 209
  // arguments (it is idempotent).                                                // 210
  //                                                                              // 211
  // If you forget to call this function for a given node, it's                   // 212
  // unspecified whether you'll receive events on IE <= 8 (you may,               // 213
  // you may not.) If you don't care about supporting IE <= 8 you                 // 214
  // can ignore this function.                                                    // 215
  installHandler: function (node, type) {                                         // 216
    // Only work on element nodes, not e.g. text nodes or fragments               // 217
    if (node.nodeType !== 1)                                                      // 218
      return;                                                                     // 219
    this.impl.installHandler(node, type);                                         // 220
                                                                                  // 221
    // When in checkIECompliance mode, mark all the nodes in the current subtree. // 222
    // We will later block events on nodes that weren't marked.  This             // 223
    // tests that Spark is generating calls to registerEventType                  // 224
    // with proper subtree information, even in browsers that don't need          // 225
    // it.                                                                        // 226
    if (this._checkIECompliance) {                                                // 227
      // set flag to mark the node for this type, recording the                   // 228
      // fact that installHandler was called for this node and type.              // 229
      // the property value can be any non-primitive value (to prevent            // 230
      // showing up as an HTML attribute in IE) so we use `node` itself.          // 231
      node['_uevents_test_eventtype_'+type] = node;                               // 232
      if (node.firstChild) {                                                      // 233
        _.each(node.getElementsByTagName('*'), function(x) {                      // 234
          x['_uevents_test_eventtype_'+type] = x;                                 // 235
        });                                                                       // 236
      }                                                                           // 237
    }                                                                             // 238
  },                                                                              // 239
                                                                                  // 240
  // Tear down this UniversalEventListener so that no more events                 // 241
  // are delivered.                                                               // 242
  destroy: function () {                                                          // 243
    var self = this;                                                              // 244
                                                                                  // 245
    listeners = _.without(listeners, self);                                       // 246
    _.each(_.keys(self.types), function (type) {                                  // 247
      self.removeType(type);                                                      // 248
    });                                                                           // 249
  }                                                                               // 250
});                                                                               // 251
                                                                                  // 252
////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////
//                                                                                //
// packages/universal-events/events-w3c.js                                        //
//                                                                                //
////////////////////////////////////////////////////////////////////////////////////
                                                                                  //
// Universal Events implementation that depends on the W3C event                  // 1
// model, i.e. addEventListener and capturing.  It's intended for all             // 2
// browsers except IE <= 8.                                                       // 3
//                                                                                // 4
// We take advantage of the fact that event handlers installed during             // 5
// the capture phase are live during the bubbling phase.  By installing           // 6
// a capturing listener on the document, we bind the handler to the               // 7
// event target and its ancestors "just in time".                                 // 8
                                                                                  // 9
var SIMULATE_NEITHER = 0;                                                         // 10
var SIMULATE_FOCUS_BLUR = 1;                                                      // 11
var SIMULATE_FOCUSIN_FOCUSOUT = 2;                                                // 12
                                                                                  // 13
UniversalEventListener._impl = UniversalEventListener._impl ||  {};               // 14
                                                                                  // 15
// Singleton                                                                      // 16
UniversalEventListener._impl.w3c = function (deliver) {                           // 17
  this.deliver = deliver;                                                         // 18
  this.typeCounts = {}; // map from event type name to count                      // 19
                                                                                  // 20
  this.boundHandler = _.bind(this.handler, this);                                 // 21
  this.boundCapturer = _.bind(this.capturer, this);                               // 22
                                                                                  // 23
  // Focusin/focusout are the bubbling versions of focus/blur, and                // 24
  // are part of the W3C spec, but are absent from Firefox as of                  // 25
  // today (v11), so we supply them.                                              // 26
  //                                                                              // 27
  // In addition, while most browsers fire these events sync in                   // 28
  // response to a programmatic action (like .focus()), not all do.               // 29
  // IE 9+ fires focusin/focusout sync but focus/blur async.  Opera               // 30
  // fires them all async.  We don't do anything about this right                 // 31
  // now, but simulating focus/blur on IE would make them sync.                   // 32
  //                                                                              // 33
  // We have the capabiilty here to simulate focusin/focusout from                // 34
  // focus/blur, vice versa, or neither.                                          // 35
  //                                                                              // 36
  // We do a browser check that fails in old Firefox (3.6) but will               // 37
  // succeed if Firefox ever implements focusin/focusout.  Old                    // 38
  // Firefox fails all tests of the form ('onfoo' in node), while                 // 39
  // new Firefox and all other known browsers will pass if 'foo' is               // 40
  // a known event.                                                               // 41
  this.focusBlurMode = ('onfocusin' in document.createElement("DIV")) ?           // 42
    SIMULATE_NEITHER : SIMULATE_FOCUSIN_FOCUSOUT;                                 // 43
                                                                                  // 44
  // mouseenter/mouseleave is non-bubbling mouseover/mouseout.  It's              // 45
  // standard but only IE and Opera seem to support it,                           // 46
  // so we simulate it (which works in IE but not in Opera for some reason).      // 47
  this.simulateMouseEnterLeave = (! window.opera);                                // 48
};                                                                                // 49
                                                                                  // 50
_.extend(UniversalEventListener._impl.w3c.prototype, {                            // 51
  addType: function (eventType) {                                                 // 52
    this._listen(this._expandEventType(eventType));                               // 53
  },                                                                              // 54
                                                                                  // 55
  removeType: function (type) {                                                   // 56
    this._unlisten(this._expandEventType(type));                                  // 57
  },                                                                              // 58
                                                                                  // 59
  installHandler: function (node, type) {                                         // 60
    // Unnecessary in w3c implementation                                          // 61
  },                                                                              // 62
                                                                                  // 63
  _expandEventType: function (type) {                                             // 64
    var ret = [type];                                                             // 65
                                                                                  // 66
    // install handlers for the events used to fake events of this                // 67
    // type, in addition to handlers for the real type                            // 68
                                                                                  // 69
    if (this.focusBlurMode === SIMULATE_FOCUS_BLUR) {                             // 70
      if (type === 'focus')                                                       // 71
        ret.push('focusin');                                                      // 72
      else if (type === 'blur')                                                   // 73
        ret.push('focusout');                                                     // 74
    } else if (this.focusBlurMode === SIMULATE_FOCUSIN_FOCUSOUT) {                // 75
      if (type === 'focusin')                                                     // 76
        ret.push('focus');                                                        // 77
      else if (type === 'focusout')                                               // 78
        ret.push('blur');                                                         // 79
    }                                                                             // 80
    if (this.simulateMouseEnterLeave) {                                           // 81
      if (type === 'mouseenter')                                                  // 82
        ret.push('mouseover');                                                    // 83
      else if (type === 'mouseleave')                                             // 84
        ret.push('mouseout');                                                     // 85
    }                                                                             // 86
                                                                                  // 87
    if (type === 'tap') {                                                         // 88
      ret.push('touchmove');                                                      // 89
      ret.push('touchend');                                                       // 90
    }                                                                             // 91
                                                                                  // 92
    return ret;                                                                   // 93
  },                                                                              // 94
                                                                                  // 95
  _listen: function (types) {                                                     // 96
    var self = this;                                                              // 97
    _.each(types, function (type) {                                               // 98
      if ((self.typeCounts[type] = (self.typeCounts[type] || 0) + 1) === 1)       // 99
        document.addEventListener(type, self.boundCapturer, true);                // 100
    });                                                                           // 101
  },                                                                              // 102
                                                                                  // 103
  _unlisten: function (types) {                                                   // 104
    var self = this;                                                              // 105
    _.each(types, function (type) {                                               // 106
      if (!(--self.typeCounts[type])) {                                           // 107
        document.removeEventListener(type, self.boundCapturer, true);             // 108
      }                                                                           // 109
    });                                                                           // 110
  },                                                                              // 111
                                                                                  // 112
  capturer: function (event) {                                                    // 113
    if (event.target.nodeType === 3) // fix text-node target                      // 114
      event.target = event.target.parentNode;                                     // 115
                                                                                  // 116
    var type = event.type;                                                        // 117
    var bubbles = event.bubbles;                                                  // 118
    var target = event.target;                                                    // 119
                                                                                  // 120
    target.addEventListener(type, this.boundHandler, false);                      // 121
                                                                                  // 122
    // According to the DOM event spec, if the DOM is mutated during              // 123
    // event handling, the original bubbling order still applies.                 // 124
    // So we can determine the chain of nodes that could possibly                 // 125
    // be bubbled to right now.                                                   // 126
    var ancestors;                                                                // 127
    if (bubbles) {                                                                // 128
      ancestors = [];                                                             // 129
      for(var n = target.parentNode; n; n = n.parentNode) {                       // 130
        n.addEventListener(type, this.boundHandler, false);                       // 131
        ancestors.push(n);                                                        // 132
      };                                                                          // 133
    }                                                                             // 134
                                                                                  // 135
    // Unbind the handlers later.                                                 // 136
    setTimeout(function() {                                                       // 137
      target.removeEventListener(type, this.boundHandler, false);                 // 138
      if (bubbles) {                                                              // 139
        _.each(ancestors, function(n) {                                           // 140
          n.removeEventListener(type, this.boundHandler, false);                  // 141
        });                                                                       // 142
      };                                                                          // 143
    }, 0);                                                                        // 144
  },                                                                              // 145
                                                                                  // 146
  handler: function (event) {                                                     // 147
    var sendUIEvent = function (type, target, bubbles, cancelable, detail) {      // 148
      var evt = document.createEvent("UIEvents");                                 // 149
      evt.initUIEvent(type, bubbles, cancelable, window, detail);                 // 150
      evt.synthetic = true;                                                       // 151
      target.dispatchEvent(evt);                                                  // 152
    };                                                                            // 153
                                                                                  // 154
    // fire synthetic focusin/focusout on blur/focus or vice versa                // 155
    if (event.currentTarget === event.target) {                                   // 156
      if (this.focusBlurMode === SIMULATE_FOCUS_BLUR) {                           // 157
        if (event.type === 'focusin')                                             // 158
          sendUIEvent('focus', event.target, false);                              // 159
        else if (event.type === 'focusout')                                       // 160
          sendUIEvent('blur', event.target, false);                               // 161
      } else if (this.focusBlurMode === SIMULATE_FOCUSIN_FOCUSOUT) {              // 162
        if (event.type === 'focus')                                               // 163
          sendUIEvent('focusin', event.target, true);                             // 164
        else if (event.type === 'blur')                                           // 165
          sendUIEvent('focusout', event.target, true);                            // 166
      }                                                                           // 167
    }                                                                             // 168
    // only respond to synthetic events of the types we are faking                // 169
    if (this.focusBlurMode === SIMULATE_FOCUS_BLUR) {                             // 170
      if (event.type === 'focus' || event.type === 'blur') {                      // 171
        if (! event.synthetic)                                                    // 172
          return;                                                                 // 173
      }                                                                           // 174
    } else if (this.focusBlurMode === SIMULATE_FOCUSIN_FOCUSOUT) {                // 175
      if (event.type === 'focusin' || event.type === 'focusout') {                // 176
        if (! event.synthetic)                                                    // 177
          return;                                                                 // 178
      }                                                                           // 179
    }                                                                             // 180
    if (this.simulateMouseEnterLeave) {                                           // 181
      if (event.type === 'mouseenter' || event.type === 'mouseleave') {           // 182
        if (! event.synthetic)                                                    // 183
          return;                                                                 // 184
      }                                                                           // 185
    }                                                                             // 186
                                                                                  // 187
    this.deliver(event);                                                          // 188
                                                                                  // 189
    // event ordering: fire mouseleave after mouseout                             // 190
    if (this.simulateMouseEnterLeave &&                                           // 191
        // We respond to mouseover/mouseout here even on                          // 192
        // bubble, i.e. when event.currentTarget !== event.target,                // 193
        // to ensure we see every enter and leave.                                // 194
        // We ignore the case where the mouse enters from                         // 195
        // a child or leaves to a child (by checking if                           // 196
        // relatedTarget is present and a descendent).                            // 197
        (! event.relatedTarget ||                                                 // 198
         (event.currentTarget !== event.relatedTarget &&                          // 199
          ! DomUtils.elementContains(                                             // 200
            event.currentTarget, event.relatedTarget)))) {                        // 201
      if (event.type === 'mouseover') {                                           // 202
        sendUIEvent('mouseenter', event.currentTarget, false);                    // 203
      }                                                                           // 204
      else if (event.type === 'mouseout') {                                       // 205
        sendUIEvent('mouseleave', event.currentTarget, false);                    // 206
      }                                                                           // 207
    }                                                                             // 208
                                                                                  // 209
    if (event.type === 'touchmove') {                                             // 210
      event.currentTarget._notTapping = true;                                     // 211
    }                                                                             // 212
    if (event.type === 'touchend') {                                              // 213
      if (!event.currentTarget._notTapping) {                                     // 214
        sendUIEvent('tap', event.currentTarget, true);                            // 215
      }                                                                           // 216
      delete event.currentTarget._notTapping;                                     // 217
    }                                                                             // 218
  }                                                                               // 219
});                                                                               // 220
                                                                                  // 221
////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////
//                                                                                //
// packages/universal-events/events-ie.js                                         //
//                                                                                //
////////////////////////////////////////////////////////////////////////////////////
                                                                                  //
// Universal Events implementation for IE versions 6-8, which lack                // 1
// addEventListener and event capturing.                                          // 2
//                                                                                // 3
// The strategy is very different.  We walk the subtree in question               // 4
// and just attach the handler to all elements.  If the handler is                // 5
// foo and the eventType is 'click', we assign node.onclick = foo                 // 6
// everywhere.  Since there is only one function object and we are                // 7
// just assigning a property, hopefully this is somewhat lightweight.             // 8
//                                                                                // 9
// We use the node.onfoo method of binding events, also called "DOM0"             // 10
// or the "traditional event registration", rather than the IE-native             // 11
// node.attachEvent(...), mainly because we have the benefit of                   // 12
// referring to `this` from the handler in order to populate                      // 13
// event.currentTarget.  It seems that otherwise we'd have to create              // 14
// a closure per node to remember what node we are handling.                      // 15
//                                                                                // 16
// We polyfill the usual event properties from their various locations.           // 17
// We also make 'change' and 'submit' bubble, and we fire 'change'                // 18
// events on checkboxes and radio buttons immediately rather than                 // 19
// only when the user blurs them, another old IE quirk.                           // 20
                                                                                  // 21
UniversalEventListener._impl = UniversalEventListener._impl ||  {};               // 22
                                                                                  // 23
// Singleton                                                                      // 24
UniversalEventListener._impl.ie = function (deliver) {                            // 25
  var self = this;                                                                // 26
  this.deliver = deliver;                                                         // 27
  this.curriedHandler = function () {                                             // 28
    self.handler.call(this, self);                                                // 29
  };                                                                              // 30
                                                                                  // 31
  // The 'submit' event on IE doesn't bubble.  We want to simulate                // 32
  // bubbling submit to match other browsers, and to do that we use               // 33
  // IE's own event machinery.  We can't dispatch events with arbitrary           // 34
  // names in IE, so we appropriate the obscure "datasetcomplete" event           // 35
  // for this purpose.                                                            // 36
  document.attachEvent('ondatasetcomplete', function () {                         // 37
    var evt = window.event;                                                       // 38
    var target = evt && evt.srcElement;                                           // 39
    if (evt.synthetic && target &&                                                // 40
        target.nodeName === 'FORM' &&                                             // 41
        evt.returnValue !== false)                                                // 42
      // No event handler called preventDefault on the simulated                  // 43
      // submit event.  That means the form should be submitted.                  // 44
      target.submit();                                                            // 45
  });                                                                             // 46
};                                                                                // 47
                                                                                  // 48
_.extend(UniversalEventListener._impl.ie.prototype, {                             // 49
  addType: function (type) {                                                      // 50
    // not necessary for IE                                                       // 51
  },                                                                              // 52
                                                                                  // 53
  removeType: function (type) {                                                   // 54
    // not necessary for IE                                                       // 55
  },                                                                              // 56
                                                                                  // 57
  installHandler: function (node, type) {                                         // 58
    // use old-school event binding, so that we can                               // 59
    // access the currentTarget as `this` in the handler.                         // 60
    // note: handler is never removed from node                                   // 61
    var prop = 'on' + type;                                                       // 62
                                                                                  // 63
    if (node.nodeType === 1) { // ELEMENT                                         // 64
      this._install(node, prop);                                                  // 65
                                                                                  // 66
      // hopefully fast traversal, since the browser is doing it                  // 67
      var descendents = node.getElementsByTagName('*');                           // 68
                                                                                  // 69
      for(var i=0, N = descendents.length; i<N; i++)                              // 70
        this._install(descendents[i], prop);                                      // 71
    }                                                                             // 72
  },                                                                              // 73
                                                                                  // 74
  _install: function (node, prop) {                                               // 75
    var props = [prop];                                                           // 76
                                                                                  // 77
    // install handlers for faking focus/blur if necessary                        // 78
    if (prop === 'onfocus')                                                       // 79
      props.push('onfocusin');                                                    // 80
    else if (prop === 'onblur')                                                   // 81
      props.push('onfocusout');                                                   // 82
    // install handlers for faking bubbling change/submit                         // 83
    else if (prop === 'onchange') {                                               // 84
      // if we're looking at a checkbox or radio button,                          // 85
      // sign up for propertychange and NOT change                                // 86
      if (node.nodeName === 'INPUT' &&                                            // 87
          (node.type === 'checkbox' || node.type === 'radio'))                    // 88
        props = ['onpropertychange'];                                             // 89
      props.push('oncellchange');                                                 // 90
    } else if (prop === 'onsubmit')                                               // 91
      props.push('ondatasetcomplete');                                            // 92
                                                                                  // 93
    for(var i = 0; i < props.length; i++)                                         // 94
      node[props[i]] = this.curriedHandler;                                       // 95
  },                                                                              // 96
                                                                                  // 97
  // This is the handler we assign to DOM nodes, so it shouldn't close over       // 98
  // anything that would create a circular reference leading to a memory leak.    // 99
  //                                                                              // 100
  // This handler is called via this.curriedHandler. When it is called:           // 101
  //  - 'this' is the node currently handling the event (set by IE)               // 102
  //  - 'self' is what would normally be 'this'                                   // 103
  handler: function (self) {                                                      // 104
    var sendEvent = function (ontype, target) {                                   // 105
      var e = document.createEventObject();                                       // 106
      e.synthetic = true;                                                         // 107
      target.fireEvent(ontype, e);                                                // 108
      return e.returnValue;                                                       // 109
    };                                                                            // 110
                                                                                  // 111
                                                                                  // 112
    var event = window.event;                                                     // 113
    var type = event.type;                                                        // 114
    var target = event.srcElement || document;                                    // 115
    event.target = target;                                                        // 116
    if (this.nodeType !== 1)                                                      // 117
      return; // sanity check that we have a real target (always an element)      // 118
    event.currentTarget = this;                                                   // 119
    var curNode = this;                                                           // 120
                                                                                  // 121
    // simulate focus/blur so that they are synchronous;                          // 122
    // simulate change/submit so that they bubble.                                // 123
    // The IE-specific 'cellchange' and 'datasetcomplete' events actually         // 124
    // have nothing to do with change and submit, we are just using them          // 125
    // as dummy events because we need event types that IE considers real         // 126
    // (and apps are unlikely to use them).                                       // 127
    if (curNode === target && ! event.synthetic) {                                // 128
      if (type === 'focusin')                                                     // 129
        sendEvent('onfocus', curNode);                                            // 130
      else if (type === 'focusout')                                               // 131
        sendEvent('onblur', curNode);                                             // 132
      else if (type === 'change')                                                 // 133
        sendEvent('oncellchange', curNode);                                       // 134
      else if (type === 'propertychange') {                                       // 135
        if (event.propertyName === 'checked')                                     // 136
          sendEvent('oncellchange', curNode);                                     // 137
      } else if (type === 'submit') {                                             // 138
        sendEvent('ondatasetcomplete', curNode);                                  // 139
      }                                                                           // 140
    }                                                                             // 141
    // ignore non-simulated events of types we simulate                           // 142
    if ((type === 'focus' || event.type === 'blur'                                // 143
         || event.type === 'change' ||                                            // 144
         event.type === 'submit') && ! event.synthetic) {                         // 145
      if (event.type === 'submit')                                                // 146
        event.returnValue = false; // block all native submits, we will submit    // 147
      return;                                                                     // 148
    }                                                                             // 149
                                                                                  // 150
    // morph the event                                                            // 151
    if (type === 'cellchange' && event.synthetic) {                               // 152
      type = event.type = 'change';                                               // 153
    }                                                                             // 154
    if (type === 'datasetcomplete' && event.synthetic) {                          // 155
      type = event.type = 'submit';                                               // 156
    }                                                                             // 157
                                                                                  // 158
    self.deliver(event);                                                          // 159
  }                                                                               // 160
                                                                                  // 161
});                                                                               // 162
                                                                                  // 163
////////////////////////////////////////////////////////////////////////////////////

}).call(this);
