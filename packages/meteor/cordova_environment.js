/**
 * @summary Boolean variable.  True if running in a Cordova mobile environment.
 * @type {Boolean}
 * @static
 * @locus Anywhere
 */
Meteor.isCordova = true;

Meteor.isProduction = meteorEnv.NODE_ENV === "production";
Meteor.isDevelopment = meteorEnv.NODE_ENV !== "production";
