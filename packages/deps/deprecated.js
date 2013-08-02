// Deprecated (Deps-recated?) functions.

// These functions used to be on the Meteor object (and worked slightly
// differently).
// XXX COMPAT WITH 0.5.7
Meteor.flush = Deps.flush;
Meteor.autorun = Deps.autorun;

// We used to require a special "autosubscribe" call to reactively subscribe to
// things. Now, it works with autorun.
// XXX COMPAT WITH 0.5.4
Meteor.autosubscribe = Deps.autorun;

// This Deps API briefly existed in 0.5.8 and 0.5.9
// XXX COMPAT WITH 0.5.9
Deps.depend = function (d) {
  return d.depend();
};
