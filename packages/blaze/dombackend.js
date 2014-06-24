var DOMBackend = {};
Blaze.DOMBackend = DOMBackend;

var $jq = (typeof jQuery !== 'undefined' ? jQuery :
           (typeof Package !== 'undefined' ?
            Package.jquery && Package.jquery.jQuery : null));
if (! $jq)
  throw new Error("jQuery not found");

DOMBackend._$jq = $jq;

DOMBackend.parseHTML = function (html) {
  // Return an array of nodes.
  //
  // jQuery does fancy stuff like creating an appropriate
  // container element and setting innerHTML on it, as well
  // as working around various IE quirks.
  return $jq.parseHTML(html) || [];
};

DOMBackend.Events = {
  // `selector` is non-null.  `type` is one type (but
  // may be in backend-specific form, e.g. have namespaces).
  // Order fired must be order bound.
  delegateEvents: function (elem, type, selector, handler) {
    $jq(elem).on(type, selector, handler);
  },

  undelegateEvents: function (elem, type, handler) {
    $jq(elem).off(type, handler);
  },

  bindEventCapturer: function (elem, type, selector, handler) {
    var $elem = $jq(elem);

    var wrapper = function (event) {
      event = $jq.event.fix(event);
      event.currentTarget = event.target;

      // Note: It might improve jQuery interop if we called into jQuery
      // here somehow.  Since we don't use jQuery to dispatch the event,
      // we don't fire any of jQuery's event hooks or anything.  However,
      // since jQuery can't bind capturing handlers, it's not clear
      // where we would hook in.  Internal jQuery functions like `dispatch`
      // are too high-level.
      var $target = $jq(event.currentTarget);
      if ($target.is($elem.find(selector)))
        handler.call(elem, event);
    };

    handler._meteorui_wrapper = wrapper;

    type = DOMBackend.Events.parseEventType(type);
    // add *capturing* event listener
    elem.addEventListener(type, wrapper, true);
  },

  unbindEventCapturer: function (elem, type, handler) {
    type = DOMBackend.Events.parseEventType(type);
    elem.removeEventListener(type, handler._meteorui_wrapper, true);
  },

  parseEventType: function (type) {
    // strip off namespaces
    var dotLoc = type.indexOf('.');
    if (dotLoc >= 0)
      return type.slice(0, dotLoc);
    return type;
  }
};


///// Removal detection and interoperability.

// For an explanation of this technique, see:
// http://bugs.jquery.com/ticket/12213#comment:23 .
//
// In short, an element is considered "removed" when jQuery
// cleans up its *private* userdata on the element,
// which we can detect using a custom event with a teardown
// hook.

var NOOP = function () {};

DOMBackend.RemovalWatch = {
  _JQUERY_EVENT_NAME: 'blaze_removal_watcher',
  _CB_PROP: '$blaze_removal_callbacks',
  // Registers a callback function to be called when the given element or
  // one of its ancestors is removed from the DOM via the backend library.
  // The callback function is called at most once, and it receives the element
  // in question as an argument.
  onRemoveElement: function (elem, func) {
    var propName = DOMBackend.RemovalWatch._CB_PROP;
    if (! elem[propName]) {
      elem[propName] = [];

      // Set up the event, only the first time.
      $jq(elem).on(DOMBackend.RemovalWatch._JQUERY_EVENT_NAME, NOOP);
    }

    elem[propName].push(func);
  },
  // Recursively call all teardown hooks, in the backend and registered
  // through DOMBackend.
  tearDownElement: function (elem) {
    var elems = Array.prototype.slice.call(elem.getElementsByTagName('*'));
    elems.push(elem);
    $jq.cleanData(elems);
  }
};

$jq.event.special[DOMBackend.RemovalWatch._JQUERY_EVENT_NAME] = {
  teardown: function() {
    var elem = this;
    var callbacks = elem[DOMBackend.RemovalWatch._CB_PROP];
    if (callbacks) {
      for (var i = 0; i < callbacks.length; i++)
        callbacks[i](elem);
      elem[DOMBackend.RemovalWatch._CB_PROP] = null;
    }
  }
};


// Must use jQuery semantics for `context`, not
// querySelectorAll's.  In other words, all the parts
// of `selector` must be found under `context`.
DOMBackend.findBySelector = function (selector, context) {
  return $jq(selector, context);
};
