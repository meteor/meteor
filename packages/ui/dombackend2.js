if (Meteor.isClient) {

  // XXX in the future, make the jQuery adapter a separate
  // package and make the choice of back-end library
  // configurable.  Adapters all expose the same DomBackend interface.

  if (! Package.jquery)
    throw new Error("Meteor UI jQuery adapter: jQuery not found.");

  var jQuery = Package.jquery.jQuery;

  var DomBackend = {};

  ///// Removal detection and interoperability.

  // For an explanation of this technique, see:
  // http://bugs.jquery.com/ticket/12213#comment:23 .
  //
  // In short, an element is considered "removed" when jQuery
  // cleans up its *private* userdata on the element,
  // which we can detect using a custom event with a teardown
  // hook.

  var JQUERY_REMOVAL_WATCHER_EVENT_NAME = 'meteor_ui_removal_watcher';
  var REMOVAL_CALLBACKS_PROPERTY_NAME = '$meteor_ui_removal_callbacks';
  var NOOP = function () {};

  // Causes `elem` (a DOM element) to be detached from its parent, if any.
  // Whether or not `elem` was detached, causes any callbacks registered
  // with `onRemoveElement` on `elem` and its descendants to fire.
  // Not for use on non-element nodes.
  //
  // This method is modeled after the behavior of jQuery's `$(elem).remove()`,
  // which causes teardown on the subtree being removed.
  DomBackend.removeElement = function (elem) {
    jQuery(elem).remove();
  };

  // Registers a callback function to be called when the given element or
  // one of its ancestors is removed from the DOM via the backend library.
  // The callback function is called at most once, and it receives the element
  // in question as an argument.
  DomBackend.onRemoveElement = function (elem, func) {
    if (! elem[REMOVAL_CALLBACKS_PROPERTY_NAME]) {
      elem[REMOVAL_CALLBACKS_PROPERTY_NAME] = [];

      // Set up the event, only the first time.
      jQuery(elem).on(JQUERY_REMOVAL_WATCHER_EVENT_NAME, NOOP);
    }

    elem[REMOVAL_CALLBACKS_PROPERTY_NAME].push(func);
  };

  jQuery.event.special[JQUERY_REMOVAL_WATCHER_EVENT_NAME] = {
    teardown: function() {
      var elem = this;
      var callbacks = elem[REMOVAL_CALLBACKS_PROPERTY_NAME];
      if (callbacks) {
        for (var i = 0; i < callbacks.length; i++)
          callbacks[i](elem);
        elem[REMOVAL_CALLBACKS_PROPERTY_NAME] = null;
      }
    }
  };

  DomBackend.parseHTML = function (html) {
    // Return an array of nodes.
    //
    // jQuery does fancy stuff like creating an appropriate
    // container element and setting innerHTML on it, as well
    // as working around various IE quirks.
    return jQuery.parseHTML(html) || [];
  };

  UI.DomBackend2 = DomBackend;

}