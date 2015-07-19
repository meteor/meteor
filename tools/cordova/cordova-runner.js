import _ from 'underscore';
import { Console } from '../console.js';

// This is a runner, that we pass to Runner (run-all.js)
export default class CordovaRunner {
  constructor(projectContext, cordovaProject, options) {
    this.projectContext = projectContext;
    this.cordovaProject = cordovaProject;
    this.options = options;
  }

  get title() {
    return `app on ${this.displayName}`;
  }

  prestart() {
    // OAuth2 packages don't work so well with any mobile platform except the iOS
    // simulator. Print a warning and direct users to the wiki page for help. (We
    // do this now instead of in start() so we don't have to worry about
    // projectContext being asynchronously reset.)
    if (!(this.platform === "ios" && this.isDevice) &&
        this.projectContext.packageMap.getInfo('oauth2')) {
      Console.warn();
      Console.labelWarn(
        "It looks like you are using OAuth2 login in your app. " +
        "Meteor's OAuth2 implementation does not currently work with " +
        "mobile apps in local development mode, except in the iOS " +
        "simulator. You can run the iOS simulator with 'meteor run ios'. " +
        "For additional workarounds, see " +
        Console.url(
          "https://github.com/meteor/meteor/wiki/" +
          "OAuth-for-mobile-Meteor-clients."));
    }
  }

  start() {
    Console.debug('Running Cordova for target', this.displayName);

    try {
      Promise.await(this.run(this.options));
    } catch (err) {
      Console.error(`${this.displayName}: failed to start the app.`,
        err.message);
    }

    try {
      Promise.await(this.tailLogs(this.options));
    } catch (err) {
      Console.error(`${this.displayName}: failed to tail logs.`,
        err.message);
    }
  }
}
