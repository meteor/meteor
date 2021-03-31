import { ensureOnlyValidVersions } from "../utils/utils.js";
import buildmessage from "../utils/buildmessage.js";
import NpmDiscards from "./npm-discards";

const nodeRequire = require;

export class PackageNpm {
  /**
   * @summary Class of the 'Npm' object visible in package.js
   * @locus package.js
   * @instanceName Npm
   * @showInstanceName true
   */
  constructor() {
    // Files to be stripped from the installed NPM dependency tree. See
    // the Npm.strip comment below for further usage information.
    this._discards = new NpmDiscards;
    this._dependencies = null;
  }

  /**
   * @summary Specify which [NPM](https://www.npmjs.org/) packages
   * your Meteor package depends on.
   * @param  {Object} dependencies An object where the keys are package
   * names and the values are one of:
   *   1. Version numbers in string form
   *   2. http(s) URLs of npm packages
   *   3. Git URLs in the format described [here](https://docs.npmjs.com/files/package.json#git-urls-as-dependencies)
   *
   * Https URL example:
   *
   * ```js
   * Npm.depends({
   *   moment: "2.8.3",
   *   async: "https://github.com/caolan/async/archive/71fa2638973dafd8761fa5457c472a312cc820fe.tar.gz"
   * });
   * ```
   *
   * Git URL example:
   *
   * ```js
   * Npm.depends({
   *   moment: "2.8.3",
   *   async: "git+https://github.com/caolan/async#master"
   * });
   * ```
   * @locus package.js
   */
  depends(dependencies) {
    // XXX make dependencies be separate between use and test, so that
    // production doesn't have to ship all of the npm modules used by test
    // code
    if (this._dependencies) {
      buildmessage.error("Npm.depends may only be called once per package",
                         { useMyCaller: true });
      // recover by ignoring the Npm.depends line
      return;
    }

    if (typeof dependencies !== 'object') {
      buildmessage.error("the argument to Npm.depends should be an " +
                         "object, like this: {gcd: '0.0.0'}",
                         { useMyCaller: true });
      // recover by ignoring the Npm.depends line
      return;
    }

    // don't allow npm fuzzy versions so that there is complete
    // consistency when deploying a meteor app
    //
    // XXX use something like seal or lockdown to have *complete*
    // confidence we're running the same code?
    try {
      ensureOnlyValidVersions(dependencies, {
        forCordova: false
      });

    } catch (e) {
      buildmessage.error(e.message, {
        useMyCaller: true,
        downcase: true
      });

      // recover by ignoring the Npm.depends line
      return;
    }

    this._dependencies = dependencies;
  }

  // The `Npm.strip` method makes up for packages that have missing
  // or incomplete .npmignore files by telling the bundler to strip out
  // certain unnecessary files and/or directories during `meteor build`.
  //
  // The `discards` parameter should be an object whose keys are
  // top-level package names and whose values are arrays of strings
  // (or regular expressions) that match paths in that package's
  // directory that should be stripped before installation. For
  // example:
  //
  //   Npm.strip({
  //     connect: [/*\.wmv$/],
  //     useragent: ["tests/"]
  //   });
  //
  // Alternatively, a single string or regular expression can be passed
  // instead of an array:
  //
  //   Npm.strip({
  //     connect: /*\.wmv$/,
  //     useragent: "tests/"
  //   });
  //
  // This means (1) "remove any files with the `.wmv` extension from
  // the 'connect' package directory" and (2) "remove the 'tests'
  // directory from the 'useragent' package directory."
  strip(discards) {
    this._discards.merge(discards);
  }

  require(name) {
    try {
      return nodeRequire(name); // from the dev bundle
    } catch (e) {
      buildmessage.error(
        "can't find npm module '" + name +
          "'. In package.js, Npm.require can only find built-in modules.",
        { useMyCaller: true });
      // recover by, uh, returning undefined, which is likely to
      // have some knock-on effects
    }
  }
}
