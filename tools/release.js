var _ = require('underscore');
var files = require('./files.js');
var project = require('./project.js');
var warehouse = require('./warehouse.js');
var release = require('./release.js');
var path = require('path');
var library = require('./library.js');

var release = exports;

var Release = function (options) {
  var self = this;

  // If an actual, proper, "released" release, the name of the
  // release, eg, "1.0". If not a proper release, null.
  self.name = options.name;

  // A Library object that can be used to access the packages in this
  // release.
  self.library = null;

  var packageDirs = _.clone(options.packageDirs);
  if (self.name === null) {
    // Running from checkout.
    packageDirs.push(path.join(files.getCurrentToolsDir(), 'packages'));
    self._manifest = null;
  } else {
    // Running a proper release
    self._manifest = options.manifest;
  }

  self.library = new library.Library({
    localPackageDirs: packageDirs,
    releaseManifest: self._manifest
  });
};

_.extend(Release.prototype, {
  // True if an actual, proper, "released" release. If so, this.name
  // will have the name of the release, eg, "1.0".
  isProperRelease: function () {
    return this.name !== null;
  },

  // True if this "release" is actually a checkout on disk. It is
  // defined by the packages in the checkout rather than by a
  // manifest. this.name will be null.
  isCheckout: function () {
    return this.name === null;
  },

  // Return the version of the command-line tools that this release
  // uses. Valid only for proper releases.
  getToolsVersion: function () {
    var self = this;

    if (! self.isProperRelease())
      throw new Error("not a proper release?");
    return self._manifest.tools;
  },

  // Return a list of the upgraders (project migrations) for this
  // release, an (ordered!) array of strings. Valid only for proper
  // releases.
  getUpgraders: function () {
    var self = this;

    if (! self.isProperRelease())
      throw new Error("not a proper release?");
    return self._manifest.upgraders || [];
  },

  // True if our version is the tools version called for in the
  // release.
  compatibleWithRunningVersion: function () {
    var self = this;

    if (! files.usesWarehouse())
      return self.isCheckout();
    else {
      return self.isProperRelease() &&
        self.getToolsVersion() === files.getToolsVersion();
    }
  }
});

// The current release. Once set, this does not change for the
// lifetime of the process.
//
// It is possible that we don't have a release. Currently this only
// comes up in one case: an app was created with a checkout version of
// Meteor, and then run with a release version of Meteor. In this case
// release.current will be null. (It will also be null during startup,
// until setRelease has been called.)
//
// (If you want to change the current release, you have to
// springboard, the same as if you want to change the current tools
// version. Besides being simpler to reason about, this helps to
// prepare us for a future where the 'meteor' tool itself is a Meteor
// app, running against a particular Meteor release.)
release.current = null;

// True if we are using release.current because we were forced to do
// that by the '--release' command line option, else false. (It is
// true anytime --release was passed, even if it's the same release we
// would have used anyway. It is false anytime the current release is
// a checkin.) null if release.current is null.
release.forced = null;

// True if release.current is the release we'd use if we wanted to run
// the app in 'appDir' (taking into account release.forced and whether
// we're currently running from a checkout).
release.usingRightReleaseForApp = function (appDir) {
  if (release.current === null)
    throw new Error("no release?");

  if (! files.usesWarehouse() || release.forced)
    return true;

  var appRelease = project.getMeteorReleaseVersion(appDir);
  if (appRelease === null)
    // Really old app that has no release specified.
    appRelease = warehouse.latestRelease();
  return release.current.appRelease === appRelease;
};

// Return the name of the latest release that is downloaded and ready
// for use. May not be called when running from a checkout.
release.latestDownloaded = function () {
  if (! files.usesWarehouse())
    throw new Error("called from checkout?");
  var ret = warehouse.latestRelease();
  if (! ret)
    throw new Error("no releases available?");
  return ret;
};

// Load a release and return it as a Release object without setting
// release.current to that release. Unlike release.setCurrent(), this
// may be called as many times as you like.
//
// This will fetch the release from the server if it isn't cached
// locally. If that happens it will print progress messages. (And if
// that fails, it will kill the process! XXX return gracefully)
//
// Arguments:
// - name: release name to use. Or pass 'null' to use a checkout
// - options:
//   - packageDirs: array of extra paths to search when searching for
//     packages. They are searched in order and take precedence over
//     anything in the release.
//   - forApp: cosmetic effect only. If set, change the messages to
//     reflect that we're downloading the release because an app needs
//     it.
//
// XXX packageDirs really should not be part of Release, and
// override() really should not be a method on a global singleton
// Library. Instead, there should be a thing like a "package resolver"
// that can be created off of a release and then configured with
// package name overrides and additional search paths. But this isn't
// pressing so we'll do it later. (My actual hope is that by time we
// get around to doing it we'll have found a less hacky way than
// override() to load a package from a directory.)
release.load = function (name, options) {
  options = options || {};

  if (! name) {
    return new Release({
      name: null,
      packageDirs: options.packageDirs
    });
  }

  // Go download the release if necessary.
  var manifest;
  try {
    // XXX may print an error and kill the process if it doesn't get
    // what it wants
    manifest =
      warehouse.ensureReleaseExistsAndReturnManifest(name);
  } catch (e) {
    if (! (e instanceof files.OfflineError))
      throw e;
    if (options.forApp) {
      process.stderr.write(
"Sorry, this project uses Meteor " + version + ", which is not installed and\n"+
"could not be downloaded. Please check to make sure that you are online.\n");
    } else {
      process.stderr.write(
"Sorry, Meteor " + version + " is not installed and could not be downloaded.\n"+
"Please check to make sure that you are online.\n");
    }
    process.exit(1);
  }

  return new Release({
    name: name,
    packageDirs: options.packageDirs,
    manifest: manifest
  });
};

// Called by the startup code to set release.current. May only be
// called once.
//
// - releaseObject: a Release as returned from release.load()
// - forced: true if the chosen release was forced from the command
//   line (by the user or by the update springboard).
release.setCurrent = function (releaseObject, forced) {
  if (release.current)
    throw new Error("release set twice?");

  release.current = releaseObject;
  release.forced = !! forced;
};
