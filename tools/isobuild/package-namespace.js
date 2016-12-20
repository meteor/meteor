import { each, size, compact } from "underscore";
import { inCheckout } from "../fs/files.js";
import buildmessage from "../utils/buildmessage.js";
import packageVersionParser from "../packaging/package-version-parser.js";

export class PackageNamespace {
  /**
   * @summary Class of the 'Package' object visible in package.js
   * @locus package.js
   * @instanceName Package
   * @showInstanceName true
   */
  constructor(packageSource) {
    this._packageSource = packageSource;
    this._fileAndDepLoader = null;
    this._hasTests = false;
  }

  // Set package metadata. Options:
  // - summary: for 'meteor list' & package server
  // - version: package version string
  // There used to be a third option documented here,
  // 'environments', but it was never implemented and no package
  // ever used it.

  /**
   * @summary Provide basic package information.
   * @locus package.js
   * @memberOf PackageNamespace
   * @param {Object} options
   * @param {String} options.summary A concise 1-2 sentence description of
   * the package, required for publication.
   * @param {String} options.version The (extended)
   * [semver](http://www.semver.org) version for your package. Additionally,
   * Meteor allows a wrap number: a positive integer that follows the
   * version number. If you are porting another package that uses semver
   * versioning, you may want to use the original version, postfixed with
   * `_wrapnumber`. For example, `1.2.3_1` or `2.4.5-rc1_4`. Wrap numbers
   * sort after the original numbers: `1.2.3` < `1.2.3_1` < `1.2.3_2` <
   * `1.2.4-rc.0`. If no version is specified, this field defaults to
   * `0.0.0`. If you want to publish your package to the package server, you
   * must specify a version.
   * @param {String} options.name Optional name override. By default, the
   * package name comes from the name of its directory.
   * @param {String} options.git Optional Git URL to the source repository.
   * @param {String} options.documentation Optional Filepath to
   * documentation. Set to 'README.md' by default. Set this to null to submit
   * no documentation.
   * @param {Boolean} options.debugOnly A package with this flag set to true
   * will not be bundled into production builds. This is useful for packages
   * meant to be used in development only.
   * @param {Boolean} options.prodOnly A package with this flag set to true
   * will ONLY be bundled into production builds.
   * @param {Boolean} options.testOnly A package with this flag set to true
   * will ONLY be bundled as part of `meteor test`.
   */
  describe(options) {
    const source = this._packageSource;

    each(options, function (value, key) {
      if (key === "summary" ||
          key === "git") {
        source.metadata[key] = value;
      } else if (key === "documentation") {
        source.metadata[key] = value;
        source.docsExplicitlyProvided = true;
      } else if (key === "version") {
        if (typeof(value) !== "string") {
          buildmessage.error("The package version (specified with "
                             + "Package.describe) must be a string.");
          // Recover by pretending that version was not set.
        } else {
          var goodVersion = true;
          try {
            var parsedVersion =
              packageVersionParser.getValidServerVersion(value);
          } catch (e) {
            if (!e.versionParserError) {
              throw e;
            }
            buildmessage.error(
              "The package version " + value + " (specified with Package.describe) "
                + "is not a valid Meteor package version.\n"
                + "Valid package versions are semver (see http://semver.org/), "
                + "optionally followed by '_' and an integer greater or equal to 1.");
            goodVersion = false;
          }
          // Recover by pretending that the version was not set.
        }
        if (goodVersion && parsedVersion !== value) {
          buildmessage.error(
            "The package version (specified with Package.describe) may not "
              + "contain a plus-separated build ID.");
          // Recover by pretending that the version was not set.
          goodVersion = false;
        }
        if (goodVersion) {
          source.version = value;
          source.versionExplicitlyProvided = true;
        }
      } else if (key === "name" && ! source.isTest) {
        if (! source.name) {
          source.name = value;
        } else if (source.name !== value) {
          // Woah, so we requested a non-test package by name, and it is not
          // the name that we find inside. That's super weird.
          buildmessage.error(
            "trying to initialize a nonexistent base package " + value);
        }

      // `debugOnly`, `prodOnly` and `testOnly` are boolean
      // flags you can put on a package, currently undocumented.
      // when set to true, they cause a package's code to be
      // only included (i.e. linked into the bundle) in dev
      // mode, prod mode (`meteor --production`) or app tests
      // (`meteor test`), and excluded otherwise.
      //
      // Notes:
      //
      // * These flags do not affect which packages or which versions are
      //   are selected by the version solver.
      //
      // * When you use a debugOnly, prodOnly or testOnly
      //   package, its exports are not imported for you.  You
      //   have to access them using
      //   `Package["my-package"].MySymbol`.
      //
      // * These flags CAN cause different package load orders in
      //   development and production!  We should probably fix this.
      //   Basically, packages that are excluded from the build using
      //   these flags are also excluded fro the build order calculation,
      //   and that's the problem
      //
      // * We should consider publicly documenting these flags, since they
      //   are effectively part of the public API.
      } else if (key === "debugOnly") {
        source.debugOnly = !!value;
      } else if (key === "prodOnly") {
        source.prodOnly = !!value;
      } else if (key === "testOnly") {
        source.testOnly = !!value;
      } else {
        // Do nothing. We might want to add some keys later, and we should err
        // on the side of backwards compatibility.
      }
      if (size(compact([source.debugOnly, source.prodOnly, source.testOnly])) > 1) {
        buildmessage.error(
          "Package can't have more than one of: debugOnly, prodOnly, testOnly.");
      }
    });
  }

  /**
   * @summary Define package dependencies and expose package methods.
   * @locus package.js
   * @param {Function} func A function that takes in the package control `api` object, which keeps track of dependencies and exports.
   */
  onUse(f) {
    if (! this._packageSource.isTest) {
      if (this._fileAndDepLoader) {
        buildmessage.error("duplicate onUse handler; a package may have " +
                           "only one", { useMyCaller: true });
        // Recover by ignoring the duplicate
        return;
      }

      this._fileAndDepLoader = f;
    }
  }

  /**
   * @deprecated in 0.9.0
   */
  on_use(f) {
    this.onUse(f);
  }

  /**
   * @summary Define dependencies and expose package methods for unit tests.
   * @locus package.js
   * @param {Function} func A function that takes in the package control 'api' object, which keeps track of dependencies and exports.
   */
  onTest(f) {
    const isTest = this._packageSource.isTest;

    // If we are not initializing the test package, then we are initializing
    // the normal package and have now noticed that it has tests. So, let's
    // register the test. This is a medium-length hack until we have new
    // control files.
    if (! isTest) {
      this._hasTests = true;
      return;
    }

    // We are initializing the test, so proceed as normal.
    if (isTest) {
      if (this._fileAndDepLoader) {
        buildmessage.error("duplicate onTest handler; a package may have " +
                           "only one", { useMyCaller: true });
        // Recover by ignoring the duplicate
        return;
      }

      this._fileAndDepLoader = f;
    }
  }

  /**
   * @deprecated in 0.9.0
   */
  on_test(f) {
    this.onTest(f);
  }

  // Define a plugin. A plugin extends the build process for
  // targets that use this package. For example, a Coffeescript
  // compiler would be a plugin. A plugin is its own little
  // program, with its own set of source files, used packages, and
  // npm dependencies.
  //
  // This is an experimental API and for now you should assume
  // that it will change frequently and radically (thus the
  // '_transitional_'). For maximum R&D velocity and for the good
  // of the platform, we will push changes that break your
  // packages that use this API. You've been warned.
  //
  // Options:
  // - name: a name for this plugin. required (cosmetic -- string)
  // - use: package to use for the plugin (names, as strings)
  // - sources: sources for the plugin (array of string)
  // - npmDependencies: map from npm package name to required
  //   version (string)

  /**
   * @summary Define a build plugin. A build plugin extends the build
   * process for apps and packages that use this package. For example,
   * the `coffeescript` package uses a build plugin to compile CoffeeScript
   * source files into JavaScript.
   * @param  {Object} [options]
   * @param {String} options.name A cosmetic name, must be unique in the
   * package.
   * @param {String|String[]} options.use Meteor packages that this
   * plugin uses, independent of the packages specified in
   * [api.onUse](#pack_onUse).
   * @param {String[]} options.sources The source files that make up the
   * build plugin, independent from [api.addFiles](#pack_addFiles).
   * @param {Object} options.npmDependencies An object where the keys
   * are NPM package names, and the values are the version numbers of
   * required NPM packages, just like in [Npm.depends](#Npm-depends).
   * @locus package.js
   */
  registerBuildPlugin(options) {
    const isTest = this._packageSource.isTest;

    // Tests don't have plugins; plugins initialized in the control file
    // belong to the package and not to the test. (This will be less
    // confusing in the new control file format).
    if (isTest) {
      return;
    }

    if (! ('name' in options)) {
      buildmessage.error("build plugins require a name",
                         { useMyCaller: true });
      // recover by ignoring plugin
      return;
    }

    const pluginInfo = this._packageSource.pluginInfo;

    if (options.name in pluginInfo) {
      buildmessage.error("this package already has a plugin named '" +
                         options.name + "'",
                         { useMyCaller: true });
      // recover by ignoring plugin
      return;
    }

    if (options.name.match(/\.\./) ||
        options.name.match(/[\\\/]/)) {
      buildmessage.error("bad plugin name", { useMyCaller: true });
      // recover by ignoring plugin
      return;
    }

    // XXX probably want further type checking
    pluginInfo[options.name] = options;
  }

  /**
   * @deprecated in 0.9.4
   */
  _transitional_registerBuildPlugin(options) {
    this.registerBuildPlugin(options);
  }

  includeTool() {
    const source = this._packageSource;
    if (! inCheckout()) {
      buildmessage.error("Package.includeTool() can only be used with a " +
                         "checkout of meteor");
    } else if (source.includeTool) {
      buildmessage.error("Duplicate includeTool call");
    } else {
      source.includeTool = true;
    }
  }
}
