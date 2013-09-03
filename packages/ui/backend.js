UI = {};

if (Meteor.isClient) {

  // XXX in the future, make the jQuery adapter a separate
  // package and make the choice of back-end library
  // configurable.  Adapters all expose the DomBackend interface.

  if (! Package.jquery)
    throw new Error("Meteor UI jQuery adapter: jQuery not found.");

  var jQuery = Package.jquery.jQuery;

  var DomBackend = {
    // Must use jQuery semantics for `context`, not
    // querySelectorAll's.  In other words, all the parts
    // of `selector` must be found under `context`.
    findBySelector: function (selector, context) {
      return jQuery.find(selector, context);
    },
    newFragment: function (nodeArray) {
      // jQuery fragments are built specially in
      // IE<9 so that they can safely hold HTML5
      // elements.
      return jQuery.buildFragment(nodeArray, document);
    },
    parseHTML: function (html) {
      // Return an array of nodes.
      //
      // jQuery does fancy stuff like creating an appropriate
      // container element and setting innerHTML on it, as well
      // as working around various IE quirks.
      return jQuery.parseHTML(html);
    },
    // `selector` is non-null.  `type` is one type (but
    // may be in backend-specific form, e.g. have namespaces).
    // Order fired must be order bound.
    delegateEvents: function (elem, type, selector, handler) {
      $(elem).on(type, selector, handler);
    },
    undelegateEvents: function (elem, type, handler) {
      $(elem).off(type, handler);
    },
    bindEventCapturer: function (elem, type, handler) {
      var wrapper = function (event) {
        event = jQuery.event.fix(event);
        event.currentTarget = event.target;
        // XXX maybe could fire more jQuery-specific stuff
        // here, like special event hooks?  At the end of the
        // day, though, jQuery just can't bind capturing
        // handlers, and if we're not putting the handler
        // in jQuery's queue, we can't call high-level
        // internal funcs like `dispatch`.
        handler.call(elem, event);
      };
      handler._meteorui_wrapper = wrapper;

      type = this.parseEventType(type);
      // add *capturing* event listener
      elem.addEventListener(type, wrapper, true);
    },
    unbindEventCapturer: function (elem, type, handler) {
      type = this.parseEventType(type);
      elem.removeEventListener(type, handler._meteorui_wrapper);
    },
    parseEventType: function (type) {
      // strip off namespaces
      var dotLoc = type.indexOf('.');
      if (dotLoc >= 0)
        return type.slice(0, dotLoc);
      return type;
    },

    // XXX EVERYTHING BELOW THIS POINT IS A WORK IN PROGRESS XXX

    watchElement: function (elem) {
      jQuery(elem).on('meteor_ui_domrange_gc', jQuery.noop);
    },
    // Called when an element is removed from the DOM using the
    // back-end library directly, either by removing it directly
    // or by removing a parent.
    //
    // To use this, override it (set it).
    onRemoveElement: function (elem) {}
  };

  // See http://bugs.jquery.com/ticket/12213#comment:23
  jQuery.event.special.meteor_ui_domrange_gc = {
    teardown: function() {
      DomBackend.onRemoveElement(this);
    }
  };

  UI.DomBackend = DomBackend;

}