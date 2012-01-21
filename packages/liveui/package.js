Package.describe({
  summary: "Meteor's machinery for making arbitrary templates reactive",
  environments: ["client"],
  internal: true
});

Package.depend('underscore');
Package.depend('livedata');
Package.depend('session');

// XXX Depends on jquery because we need a selector engine to resolve
// event maps. What would be nice is, if you've included jquery or
// zepto, use one of those; if not, ship our own copy of sizzle (but,
// you still want the event object normalization that jquery provides?)
Package.depend('jquery');

Package.source('liverange.js');
Package.source('liveui.js');

// XXX this should be loaded only in test code, not in the app!
Package.source('liverange_test_helpers.js');
