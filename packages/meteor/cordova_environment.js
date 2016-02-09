/**
 * @summary Boolean variable.  True if running in a Cordova mobile environment.
 * @type {Boolean}
 * @static
 * @locus Anywhere
 */
Meteor.isCordova = true;

var nodeEnv = process.env.NODE_ENV;
Meteor.isProduction = nodeEnv === "production";
Meteor.isDevelopment = nodeEnv === "development";
