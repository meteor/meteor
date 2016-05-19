var _ = require('underscore');

var files = require('../fs/files.js');
var catalog = require('./catalog/catalog.js');

var release = exports;

var Release = function (options) {
  var self = this;

  // If an actual, proper, "released" release, the name of the
  // release, eg, "METEOR@1.0". If not a proper release, null.
  self.name = options.name;

  if (self.name === null) {
    // Running from checkout.
    self._manifest = null;
  } else {
    // Running a proper release
    self._manifest = options.manifest;
  }
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

  isRecommended: function () {
    return this._manifest.recommended;
  },

  getReleaseTrack: function () {
    var self = this;
    if (! self.isProperRelease()) {
      throw new Error("not a proper release?");
    }
    return self.name.split('@')[0];
  },

  getReleaseVersion: function () {
    var self = this;
    if (! self.isProperRelease()) {
      throw new Error("not a proper release?");
    }
    return self.name.split('@')[1];
  },

  // Return the package name for the command-line tools that this release
  // uses. Valid only for proper releases.
  getToolsPackage: function () {
    var self = this;

    if (! self.isProperRelease()) {
      throw new Error("not a proper release?");
    }
    // XXX validate
    return self._manifest.tool.split('@')[0];
  },

  // Return the version of the command-line tools that this release
  // uses. Valid only for proper releases.
  getToolsVersion: function () {
    var self = this;

    if (! self.isProperRelease()) {
      throw new Error("not a proper release?");
    }
    // XXX validate
    return self._manifest.tool.split('@')[1];
  },

  // Return the package name and version of the command-line tools that this
  // release uses. Valid only for proper releases.
  getToolsPackageAtVersion: function () {
    var self = this;

    if (! self.isProperRelease()) {
      throw new Error("not a proper release?");
    }
    return self._manifest.tool;
  },

  // Return the tool that we are using. If this is a proper release, return the
  // tool package listed in the manifest, otherwise return the version of the
  // meteor-tool package in checkout.
  getCurrentToolsVersion: function () {
    var self = this;

    if (release.current.name) {
      return self._manifest.tool;
    } else {
      return "meteor-tool@CHECKOUT";
    }
  },

  // Return a list of the upgraders (project migrations) for this
  // release, an (ordered!) array of strings. Valid only for proper
  // releases.
  getUpgraders: function () {
    var self = this;

    if (! self.isProperRelease()) {
      throw new Error("not a proper release?");
    }
    return self._manifest.upgraders || [];
  },

  getPackages: function () {
    var self = this;

    if (! self.isProperRelease()) {
      throw new Error("not a proper release?");
    }
    return self._manifest.packages;
  },

  getCatalogReleaseData: function () {
    var self = this;
    if (! self.isProperRelease()) {
      throw new Error("not a proper release?");
    }
    return self._manifest;
  },

  getDisplayName: function (options) {
    var self = this;
    const catalogUtils = require('./catalog/catalog-utils.js');
    return catalogUtils.displayRelease(
      self.getReleaseTrack(),
      self.getReleaseVersion(),
      options);
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

// True if we are using release.current because we were forced to do that by the
// '--release' command line option or via throwing SpringboardToLatestRelease,
// else false. (It is true anytime --release was passed, even if it's the same
// release we would have used anyway. It is false anytime the current release is
// a checkin.) null if release.current is null.
release.forced = null;

// True if the release was explicitly specified by the user with the --release
// flag. Unlike release.forced, this is false when the release is overridden via
// SpringboardToLatestRelease.
release.explicit = null;

// True if release.current is the release we'd use if we wanted to run the app
// in the current project. (taking into account release.forced and whether we're
// currently running from a checkout).
release.usingRightReleaseForApp = function (projectContext) {
  if (release.current === null) {
    throw new Error("no release?");
  }

  if (! files.usesWarehouse() || release.forced) {
    return true;
  }

  return release.current.name === projectContext.releaseFile.fullReleaseName;
};

// Return the name of the latest release that is downloaded and ready
// for use. May not be called when running from a checkout.
// 'track' is optional (it defaults to the default track).
release.latestKnown = function (track) {
  if (! files.usesWarehouse()) {
    throw new Error("called from checkout?");
  }
  // For self-test only.
  if (process.env.METEOR_TEST_LATEST_RELEASE) {
    return process.env.METEOR_TEST_LATEST_RELEASE;
  }


  var defaultRelease = catalog.official.getDefaultReleaseVersion(track);

  if (!defaultRelease) {
    return null;
  }
  return defaultRelease.track + '@' + defaultRelease.version;
};

// Load a release and return it as a Release object without setting
// release.current to that release. Unlike release.setCurrent(), this
// may be called as many times as you like.
//
// This will fetch the release from the server if it isn't cached
// locally. If that happens it will print progress messages.
//
// Arguments:
// - name: release name to use. Or pass 'null' to use a checkout
// - options:
//   - quiet: if the release has to be downloaded, don't print
//     progress messages.
//
// Throws:
// - files.OfflineError if it was not possible to load the
//   release because it's not locally cached and we're not online.
// - warehouse.NoSuchReleaseError if no release called 'name' exists
//   in the world (confirmed with server).
release.load = function (name, options) {
  options = options || {};

  if (! name) {
    return new Release({ name: null });
  }

  var parts = name.split('@');
  if (parts.length > 2) {
    // XXX #Pre090 better error handling
    throw Error("too many @s in release name");
  }
  var track, version;
  if (parts.length == 2) {
    track = parts[0];
    version = parts[1];
  } else {
    track = catalog.DEFAULT_TRACK;
    version = parts[0];
    name = track + '@' + version;
  }

  var releaseVersion = catalog.official.getReleaseVersion(track, version);
  if (releaseVersion === null) {
    throw new release.NoSuchReleaseError;
  }

  return new Release({
    name: name,
    manifest: releaseVersion  // XXX rename from manifest?
  });
};

// Called by the startup code to set release.current. May only be
// called once.
//
// - releaseObject: a Release as returned from release.load()
// - forced: true if the chosen release was forced from the command
//   line (by the user or by the update springboard).
// - explicit: true if the release was specifically requested by the user.
release.setCurrent = function (releaseObject, forced, explicit) {
  if (release.current) {
    throw new Error("release set twice?");
  }

  release.current = releaseObject;
  release.forced = !! forced;
  release.explicit = !! explicit;
};

// An exception meaning that you asked for a release that doesn't exist in the
// new packaging world.  (It may still exist in the pre-0.9.0 packaging world.)
release.NoSuchReleaseError = function () {
};
