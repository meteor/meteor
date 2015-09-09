/**
 * @summary The Meteor namespace
 * @namespace Meteor
 */
Meteor = {

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
  isCordova: false
};

if (typeof __meteor_runtime_config__ === 'object' &&
    __meteor_runtime_config__.PUBLIC_SETTINGS) {
  /**
   * @summary `Meteor.settings` contains deployment-specific configuration options. You can initialize settings by passing the `--settings` option (which takes the name of a file containing JSON data) to `meteor run` or `meteor deploy`. When running your server directly (e.g. from a bundle), you instead specify settings by putting the JSON directly into the `METEOR_SETTINGS` environment variable. If the settings object contains a key named `public`, then `Meteor.settings.public` will be available on the client as well as the server.  All other properties of `Meteor.settings` are only defined on the server.  You can rely on `Meteor.settings` and `Meteor.settings.public` being defined objects (not undefined) on both client and server even if there are no settings specified.  Changes to `Meteor.settings.public` at runtime will be picked up by new client connections.
   * @locus Anywhere
   * @type {Object}
   */
  Meteor.settings = { 'public': __meteor_runtime_config__.PUBLIC_SETTINGS };
}
