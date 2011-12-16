Package.describe({
  summary: "Skybreak's machinery for making arbitrary templates reactive",
  internal: true
});

Package.require('underscore');
Package.require('livedata');
Package.require('session');

// XXX Depends on jquery because we need a selector engine to resolve
// event maps. What would be nice is, if you've included jquery or
// zepto, use one of those; if not, ship our own copy of sizzle (but,
// you still want the event object normalization that jquery provides?)
Package.require('jquery');

Package.client_file('liverange.js');
Package.client_file('liveui.js');
