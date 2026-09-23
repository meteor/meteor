/**
 * @summary Boolean variable.  True if running in a Tauri native environment.
 * @type {Boolean}
 * @static
 * @locus Anywhere
 */
Meteor.isTauri = true;

Meteor.isProduction = meteorEnv.NODE_ENV === "production";
Meteor.isDevelopment = meteorEnv.NODE_ENV !== "production";

// For now, since we can't send different bundles to different Tauri
// webviews at runtime, all Tauri clients are regarded as legacy.
Meteor.isModern = false;
