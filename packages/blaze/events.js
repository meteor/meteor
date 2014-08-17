var EventSupport = Blaze._EventSupport = {};

var DOMBackend = Blaze._DOMBackend;

// List of events to always delegate, never capture.
// Since jQuery fakes bubbling for certain events in
// certain browsers (like `submit`), we don't want to
// get in its way.
//
// We could list all known bubbling
// events here to avoid creating speculative capturers
// for them, but it would only be an optimization.
var eventsToDelegate = EventSupport.eventsToDelegate = {
  blur: 1, change: 1, click: 1, focus: 1, focusin: 1,
  focusout: 1, reset: 1, submit: 1
};

var EVENT_MODE = EventSupport.EVENT_MODE = {
  TBD: 0,
  BUBBLING: 1,
  CAPTURING: 2
};

var NEXT_HANDLERREC_ID = 1;

var HandlerRec = function (elem, type, selector, handler, recipient) {
  this.elem = elem;
  this.type = type;
  this.selector = selector;
  this.handler = handler;
  this.recipient = recipient;
  this.id = (NEXT_HANDLERREC_ID++);

  this.mode = EVENT_MODE.TBD;

  // It's important that delegatedHandler be a different
  // instance for each handlerRecord, because its identity
  // is used to remove it.
  //
  // It's also important that the closure have access to
  // `this` when it is not called with it set.
  this.delegatedHandler = (function (h) {
    return function (evt) {
      if ((! h.selector) && evt.currentTarget !== evt.target)
        // no selector means only fire on target
        return;
      return h.handler.apply(h.recipient, arguments);
    };
  })(this);

  // WHY CAPTURE AND DELEGATE: jQuery can't delegate
  // non-bubbling events, because
  // event capture doesn't work in IE 8.  However, there
  // are all sorts of new-fangled non-bubbling events
  // like "play" and "touchenter".  We delegate these
  // events using capture in all browsers except IE 8.
  // IE 8 doesn't support these events anyway.

  var tryCapturing = elem.addEventListener &&
        (! _.has(eventsToDelegate,
                 DOMBackend.Events.parseEventType(type)));

  if (tryCapturing) {
    this.capturingHandler = (function (h) {
      return function (evt) {
        if (h.mode === EVENT_MODE.TBD) {
          // must be first time we're called.
          if (evt.bubbles) {
            // this type of event bubbles, so don't
            // get called again.
            h.mode = EVENT_MODE.BUBBLING;
            DOMBackend.Events.unbindEventCapturer(
              h.elem, h.type, h.capturingHandler);
            return;
          } else {
            // this type of event doesn't bubble,
            // so unbind the delegation, preventing
            // it from ever firing.
            h.mode = EVENT_MODE.CAPTURING;
            DOMBackend.Events.undelegateEvents(
              h.elem, h.type, h.delegatedHandler);
          }
        }

        h.delegatedHandler(evt);
      };
    })(this);

  } else {
    this.mode = EVENT_MODE.BUBBLING;
  }
};
EventSupport.HandlerRec = HandlerRec;

HandlerRec.prototype.bind = function () {
  // `this.mode` may be EVENT_MODE_TBD, in which case we bind both. in
  // this case, 'capturingHandler' is in charge of detecting the
  // correct mode and turning off one or the other handlers.
  if (this.mode !== EVENT_MODE.BUBBLING) {
    DOMBackend.Events.bindEventCapturer(
      this.elem, this.type, this.selector || '*',
      this.capturingHandler);
  }

  if (this.mode !== EVENT_MODE.CAPTURING)
    DOMBackend.Events.delegateEvents(
      this.elem, this.type,
      this.selector || '*', this.delegatedHandler);
};

HandlerRec.prototype.unbind = function () {
  if (this.mode !== EVENT_MODE.BUBBLING)
    DOMBackend.Events.unbindEventCapturer(this.elem, this.type,
                                          this.capturingHandler);

  if (this.mode !== EVENT_MODE.CAPTURING)
    DOMBackend.Events.undelegateEvents(this.elem, this.type,
                                       this.delegatedHandler);
};

EventSupport.listen = function (element, events, selector, handler, recipient, getParentRecipient) {

  // Prevent this method from being JITed by Safari.  Due to a
  // presumed JIT bug in Safari -- observed in Version 7.0.6
  // (9537.78.2) -- this method may crash the Safari render process if
  // it is JITed.
  // Repro: https://github.com/dgreensp/public/tree/master/safari-crash
  try { element = element; } finally {}

  var eventTypes = [];
  events.replace(/[^ /]+/g, function (e) {
    eventTypes.push(e);
  });

  var newHandlerRecs = [];
  for (var i = 0, N = eventTypes.length; i < N; i++) {
    var type = eventTypes[i];

    var eventDict = element.$blaze_events;
    if (! eventDict)
      eventDict = (element.$blaze_events = {});

    var info = eventDict[type];
    if (! info) {
      info = eventDict[type] = {};
      info.handlers = [];
    }
    var handlerList = info.handlers;
    var handlerRec = new HandlerRec(
      element, type, selector, handler, recipient);
    newHandlerRecs.push(handlerRec);
    handlerRec.bind();
    handlerList.push(handlerRec);
    // Move handlers of enclosing ranges to end, by unbinding and rebinding
    // them.  In jQuery (or other DOMBackend) this causes them to fire
    // later when the backend dispatches event handlers.
    if (getParentRecipient) {
      for (var r = getParentRecipient(recipient); r;
           r = getParentRecipient(r)) {
        // r is an enclosing range (recipient)
        for (var j = 0, Nj = handlerList.length;
             j < Nj; j++) {
          var h = handlerList[j];
          if (h.recipient === r) {
            h.unbind();
            h.bind();
            handlerList.splice(j, 1); // remove handlerList[j]
            handlerList.push(h);
            j--; // account for removed handler
            Nj--; // don't visit appended handlers
          }
        }
      }
    }
  }

  return {
    // closes over just `element` and `newHandlerRecs`
    stop: function () {
      var eventDict = element.$blaze_events;
      if (! eventDict)
        return;
      // newHandlerRecs has only one item unless you specify multiple
      // event types.  If this code is slow, it's because we have to
      // iterate over handlerList here.  Clearing a whole handlerList
      // via stop() methods is O(N^2) in the number of handlers on
      // an element.
      for (var i = 0; i < newHandlerRecs.length; i++) {
        var handlerToRemove = newHandlerRecs[i];
        var info = eventDict[handlerToRemove.type];
        if (! info)
          continue;
        var handlerList = info.handlers;
        for (var j = handlerList.length - 1; j >= 0; j--) {
          if (handlerList[j] === handlerToRemove) {
            handlerToRemove.unbind();
            handlerList.splice(j, 1); // remove handlerList[j]
          }
        }
      }
      newHandlerRecs.length = 0;
    }
  };
};
