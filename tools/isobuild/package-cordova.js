import { ensureOnlyValidVersions } from "../utils/utils.js";
import buildmessage from "../utils/buildmessage.js";

  /**
   * @summary Class of the 'Cordova' object visible in package.js
   * @locus package.js
   * @instanceName Cordova
   * @showInstanceName true
   */
export class PackageCordova {
  constructor() {
    this._dependencies = null;
  }

  /**
   * @summary Specify which [Cordova / PhoneGap](http://cordova.apache.org/)
   * plugins your Meteor package depends on.
   *
   * Plugins are installed from
   * [plugins.cordova.io](http://plugins.cordova.io/), so the plugins and
   * versions specified must exist there. Alternatively, the version
   * can be replaced with a GitHub tarball URL as described in the
   * [Cordova](https://guide.meteor.com/cordova.html#cordova-plugins)
   * page of the Meteor wiki on GitHub.
   * @param  {Object} dependencies An object where the keys are plugin
   * names and the values are version numbers or GitHub tarball URLs
   * in string form.
   * Example:
   *
   * ```js
   * Cordova.depends({
   *   "org.apache.cordova.camera": "0.3.0"
   * });
   * ```
   *
   * Alternatively, with a GitHub URL:
   *
   * ```js
   * Cordova.depends({
   *   "org.apache.cordova.camera":
   *     "https://github.com/apache/cordova-plugin-camera/tarball/d84b875c449d68937520a1b352e09f6d39044fbf"
   * });
   * ```
   *
   * @locus package.js
   */
  depends(dependencies) {
    // XXX make cordovaDependencies be separate between use and test, so that
    // production doesn't have to ship all of the npm modules used by test
    // code
    if (this._dependencies) {
      buildmessage.error("Cordova.depends may only be called once per package",
                         { useMyCaller: true });
      // recover by ignoring the Cordova.depends line
      return;
    }

    if (typeof dependencies !== 'object') {
      buildmessage.error("the argument to Cordova.depends should be an " +
                         "object, like this: {gcd: '0.0.0'}",
                         { useMyCaller: true });
      // recover by ignoring the Cordova.depends line
      return;
    }

    // don't allow cordova fuzzy versions so that there is complete
    // consistency when deploying a meteor app
    //
    // XXX use something like seal or lockdown to have *complete*
    // confidence we're running the same code?
    try {
      ensureOnlyValidVersions(dependencies, {
        forCordova: true
      });

    } catch (e) {
      buildmessage.error(e.message, {
        useMyCaller: true,
        downcase: true
      });

      // recover by ignoring the Cordova.depends line
      return;
    }

    this._dependencies = dependencies;
  }
}
