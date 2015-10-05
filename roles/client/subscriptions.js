"use strict"


/**
 * Subscription handle for the currently logged in user's permissions.
 *
 * NOTE: The corresponding publish function, `_roles`, depends on
 * `this.userId` so it will automatically re-run when the currently
 * logged-in user changes.
 *
 * @example
 *
 *     `Roles.subscription.ready()` // => `true` if user roles have been loaded
 *
 * @property subscription
 * @type Object
 * @for Roles
 */

Tracker.autorun(function () {
  Roles.subscription = Meteor.subscribe("_roles")
})
