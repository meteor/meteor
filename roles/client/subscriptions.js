"use strict"


// Subscribe to get the currently logged in user's permissions.
//
// Publish function depends on `this.userId` so it automatically
// re-runs when logged-in user changes.

Tracker.autorun(function () {
  Roles.subscription = Meteor.subscribe("_roles")
})
