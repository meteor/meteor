/**
 * @module capacitor_server
 * @description Server-side runtime for the capacitor package.
 */

import { Meteor } from 'meteor/meteor';

Meteor.isCapacitor = false;

if (process.env.METEOR_CAPACITOR === 'true') {
  // Future: hook WebAppInternals.staticFilesMiddleware to patch the served
  // /__cordova/index.html in livereload/dev modes.
}
