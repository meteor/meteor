"use strict";

/**
 * Subscription handle for the collection of all existing roles.
 *
 * @example
 *
 *     Roles.subscription.ready(); // true if roles have been loaded
 *
 * @property subscription
 * @type Object
 * @for Roles
 * @static
 */

Tracker.autorun(function () {
  Roles.subscription = Meteor.subscribe('_roles');
});
