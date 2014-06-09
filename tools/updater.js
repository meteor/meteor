var path = require('path');
var fs = require('fs');
var _ = require('underscore');
var inFiber = require('./fiber-helpers.js').inFiber;
var files = require('./files.js');
var tropohouse = require('./tropohouse.js');
var httpHelpers = require('./http-helpers.js');
var config = require('./config.js');
var release = require('./release.js');
var runLog = require('./run-log.js');
var catalog = require('./catalog.js');
var archinfo = require('./archinfo.js');
var unipackage = require('./unipackage.js');
var utils = require('./utils.js');

/**
 * Check to see if an update is available. If so, download and install
 * it before returning.
 *
 * options: showBanner
 */
var checkInProgress = false;
exports.tryToDownloadUpdate = function (options) {
  options = options || {};
  // Don't run more than one check simultaneously. It should be
  // harmless but having two downloads happening simultaneously (and
  // two sets of messages being printed) would be confusing.
  if (checkInProgress)
    return;
  checkInProgress = true;
  checkForUpdate(!!options.showBanner);
  checkInProgress = false;
};

var checkForUpdate = function (showBanner) {
  // XXX we should ignore errors here, right?  but still do the "can we update
  // this app with a locally available release" check.
  catalog.official.refresh();

  if (!release.current.isProperRelease())
    return;

  updateMeteorToolSymlink();

  maybeShowBanners();
};

var maybeShowBanners = function () {
  var banner = release.current.getBanner();

  if (banner) {
    var bannersShown = {};
    try {
      bannersShown = JSON.parse(
        fs.readFileSync(config.getBannersShownFilename()));
    } catch (e) {
      // ... ignore
    }

    var shouldShowBanner = false;
    if (_.has(bannersShown, release.current.name)) {
      // XXX use EJSON so that we can just have Dates
      var lastShown = new Date(bannersShown[release.current.name]);
      var bannerUpdated = banner.lastUpdated ?
            new Date(banner.lastUpdated) : new Date;
      // XXX should the default really be "once ever" and not eg "once a week"?
      if (lastShown < bannerUpdated) {
        shouldShowBanner = true;
      }
    } else {
      shouldShowBanner = true;
    }

    if (shouldShowBanner) {
      // This banner is new; print it!
      runLog.log("");
      runLog.log(banner.text);
      runLog.log("");
      bannersShown[release.current.name] = new Date;
      // XXX ick slightly racy
      fs.writeFileSync(config.getBannersShownFilename(),
                       JSON.stringify(bannersShown, null, 2));
      return;
    }
  }

  // Didn't print a banner? Maybe we have a patch release to recommend.

  var patchReleaseVersion = release.current.getPatchReleaseVersion();
  if (patchReleaseVersion) {
    var patch =
          release.current.getReleaseTrack() === catalog.official.DEFAULT_TRACK
          ? patchReleaseVersion
          : release.current.getReleaseTrack() + '@' + patchReleaseVersion;
    runLog.log("=> A patch (" + patch + ") for your current release is available.");
    runLog.log("   Update this project now with 'meteor update --patch'.");
    return;
  }

  //   var currentReleaseTrack = release.current.getReleaseTrack();
  //   var latestReleaseVersion = catalog.official.getDefaultReleaseVersion(
  //     currentReleaseTrack);
  // -  // Maybe you're on some random track with nothing recommended. That's OK.
  // -  if (!latestReleaseVersion)
  // -    return;

  // XXX print banners

  // var manifestLatestRelease =
  //   manifest && manifest.releases && manifest.releases.stable &&
  //   manifest.releases.stable.version;
  // var localLatestRelease = warehouse.latestRelease();
  // if (manifestLatestRelease && manifestLatestRelease !== localLatestRelease) {
  //   // The manifest is telling us about a release that isn't our latest
  //   // release! First, print a banner... but only if we've never printed a
  //   // banner for this release before. (Or, well... only if this release isn't
  //   // the last release which has had a banner printed.)
  //   if (manifest.releases.stable.banner &&
  //       warehouse.lastPrintedBannerRelease() !== manifestLatestRelease) {
  //     if (showBanner) {
  //       runLog.log("");
  //       runLog.log(manifest.releases.stable.banner);
  //       runLog.log("");
  //     }
  //     warehouse.writeLastPrintedBannerRelease(manifestLatestRelease);
  //   } else {
  //     // Already printed this banner, or maybe there is no banner.
  //     if (showBanner) {
  //       runLog.log("=> Meteor " + manifestLatestRelease +
  //                  " is being downloaded in the background.");
  //     }
  //   }
  //   warehouse.fetchLatestRelease();
  //   // We should now have fetched the latest release, which *probably* is
  //   // manifestLatestRelease. As long as it's changed from the one it was
  //   // before we tried to fetch it, print that out.
  //   var newLatestRelease = warehouse.latestRelease();
  //   if (showBanner && newLatestRelease !== localLatestRelease) {
  //     runLog.log(
  //       "=> Meteor " + newLatestRelease +
  //       " is available. Update this project with 'meteor update'.");
  //   }
  //   return;
  // }

  // // We didn't do a global update (or we're not online), but do we need to
  // // update this app? Specifically: is our local latest release something
  // // other than this app's release, and the user didn't specify a specific
  // // release at the command line with --release?
  // if (showBanner &&
  //     localLatestRelease !== release.current.name &&
  //     ! release.forced) {
  //   runLog.log(
  //     "=> Meteor " + localLatestRelease +
  //     " is available. Update this project with 'meteor update'.");
  // }
};

// Update ~/.meteor0/meteor to point to the tool binary from the tools of the
// latest recommended release on the default release track.
var updateMeteorToolSymlink = function () {
  // Get the latest release version of METEOR-CORE. (*Always* of the default
  // track, not of whatever we happen to be running: we always want the tool
  // symlink to go to the default track.)
  var latestReleaseVersion = catalog.official.getDefaultReleaseVersion();
  // Maybe you're on some random track with nothing recommended. That's OK.
  if (!latestReleaseVersion)
    return;

  var latestRelease = catalog.official.getReleaseVersion(
    latestReleaseVersion.track, latestReleaseVersion.version);
  if (!latestRelease)
    throw Error("latest release doesn't exist?");
  if (!latestRelease.tool)
    throw Error("latest release doesn't have a tool?");

  var latestReleaseToolParts = latestRelease.tool.split('@');
  var latestReleaseToolPackage = latestReleaseToolParts[0];
  var latestReleaseToolVersion = latestReleaseToolParts[1];
  var relativeToolPath = tropohouse.default.packagePath(
    latestReleaseToolPackage, latestReleaseToolVersion, true);

  var localLatestReleaseLink = tropohouse.default.latestMeteorSymlink();
  if (!utils.startsWith(localLatestReleaseLink, relativeToolPath + path.sep)) {
    // The latest release from the catalog is not where the ~/.meteor0/meteor
    // symlink points to. Let's make sure we have that release on disk,
    // and then update the symlink.
    // XXX download the packages too?
    tropohouse.default.maybeDownloadPackageForArchitectures(
      {packageName: latestReleaseToolPackage,
       version: latestReleaseToolVersion},
      [archinfo.host()]);

    var toolUnipackage = new unipackage.Unipackage;
    toolUnipackage.initFromPath(
      latestReleaseToolPackage,
      tropohouse.default.packagePath(latestReleaseToolPackage,
                                     latestReleaseToolVersion));
    var toolRecord = _.findWhere(toolUnipackage.toolsOnDisk,
                                 {arch: archinfo.host()});
    // XXX maybe we shouldn't throw from this background thing
    if (!toolRecord)
      throw Error("latest release has no tool?");

    console.log("XXX updating tool symlink for",
                latestReleaseVersion.track + "@" + latestReleaseVersion.version);

    tropohouse.default.replaceLatestMeteorSymlink(
      path.join(relativeToolPath, toolRecord.path, 'meteor'));
  }
};
