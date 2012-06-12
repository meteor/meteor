
Meteor.ui = Meteor.ui || {};

// LiveEvents is unit-tested by the LiveUI tests, because it was
// originally extracted from liveui.js.


// TEST FLAG: requirePreciseEventHandlers
//
// This flag enables extra checking that LiveUI is correctly registering new
// DOM nodes with LiveEvents, even in browsers that don't require it.
// If the checks fail, it means the tests would
// fail anyway in Old IE, but this way we get to find out sooner.
//
// The reason for this set-up is that the main (W3C) implementation of
// LiveEvents doesn't need to know when nodes are added to the DOM
// via the "subtreeRoot" information in registerEventType.
// However, the Old IE implementation does, so it's important that LiveUI
// tell us specifically what nodes need event handlers.  When this
// flag is true, we hold LiveUI to the same standard of specificity whether
// or not we are running Old IE.
//
// This flag is set to `true` when running unit tests (via the inclusion
// of this file).  Of course, the tests are assumed to still pass even if
// it is `false`, in which case the extra checks aren't done.
Meteor.ui._TEST_requirePreciseEventHandlers = true;
