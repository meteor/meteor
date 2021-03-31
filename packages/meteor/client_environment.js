var config = __meteor_runtime_config__;
meteorEnv = config.meteorEnv;

/**
 * @summary The Meteor namespace
 * @namespace Meteor
 */
Meteor = {
  /**
   * @summary Boolean variable.  True if running in production environment.
   * @locus Anywhere
   * @static
   * @type {Boolean}
   */
  isProduction: meteorEnv.NODE_ENV === "production",

  /**
   * @summary Boolean variable.  True if running in development environment.
   * @locus Anywhere
   * @static
   * @type {Boolean}
   */
  isDevelopment: meteorEnv.NODE_ENV !== "production",

  /**
   * @summary Boolean variable.  True if running in client environment.
   * @locus Anywhere
   * @static
   * @type {Boolean}
   */
  isClient: true,

  /**
   * @summary Boolean variable.  True if running in server environment.
   * @locus Anywhere
   * @static
   * @type {Boolean}
   */
  isServer: false,

  /**
   * @summary Boolean variable.  True if running in Cordova environment.
   * @locus Anywhere
   * @static
   * @type {Boolean}
   */
  isCordova: false,

  /**
   * @summary Boolean variable. True if running in a "modern" JS
   *          environment, as determined by the `modern` package.
   * @locus Anywhere
   * @static
   * @type {Boolean}
   */
  isModern: config.isModern
};

if (config.gitCommitHash) {
  /**
   * @summary Hexadecimal Git commit hash, if the application is using Git
   *          for version control. Undefined otherwise.
   * @locus Anywhere
   * @static
   * @type {String}
   */
  Meteor.gitCommitHash = config.gitCommitHash;
}

if (config.PUBLIC_SETTINGS) {
  /**
   * @summary `Meteor.settings` contains deployment-specific configuration options. You can initialize settings by passing the `--settings` option (which takes the name of a file containing JSON data) to `meteor run` or `meteor deploy`. When running your server directly (e.g. from a bundle), you instead specify settings by putting the JSON directly into the `METEOR_SETTINGS` environment variable. If the settings object contains a key named `public`, then `Meteor.settings.public` will be available on the client as well as the server.  All other properties of `Meteor.settings` are only defined on the server.  You can rely on `Meteor.settings` and `Meteor.settings.public` being defined objects (not undefined) on both client and server even if there are no settings specified.  Changes to `Meteor.settings.public` at runtime will be picked up by new client connections.
   * @locus Anywhere
   * @type {Object}
   */
  Meteor.settings = {
    "public": config.PUBLIC_SETTINGS
  };
}
