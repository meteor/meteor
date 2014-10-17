var path = require('path');
var fs = require('fs');
var _ = require('underscore');
var files = require('./files.js');
var tropohouse = require('./tropohouse.js');
var httpHelpers = require('./http-helpers.js');
var config = require('./config.js');
var release = require('./release.js');
var runLog = require('./run-log.js');
var catalog = require('./catalog.js');
var archinfo = require('./archinfo.js');
var isopack = require('./isopack.js');
var utils = require('./utils.js');
var buildmessage = require('./buildmessage.js');
var Console = require('./console.js').Console;

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

var firstCheck = true;

var checkForUpdate = function (showBanner) {
  var messages = buildmessage.capture(function () {
    if (firstCheck) {
      // We want to avoid a potential race condition here, because we run an update almost immediately
      // at run.  We don't want to drop the resolver cache; that would be slow.  "meteor run" itself
      // should have run a refresh anyway.  So, the first time, we just skip the remote catalog sync.
      // But we do want to do the out-of-date release checks, so we can't just delay the first update cycle.
      firstCheck = false;
    } else {
      // Silent is currently unused, but we keep it as a hint here...
      try {
        catalog.complete.refreshOfficialCatalog({silent: true});
      } catch (err) {
        Console.debug("Failed to refresh catalog, ignoring error", err);
        return;
      }
    }

    if (!release.current.isProperRelease())
      return;

    updateMeteorToolSymlink();

    maybeShowBanners();
  });

  if (messages.hasMessages()) {
    // Ignore, since running in the background.
    // XXX unfortunately the "can't refresh" message still prints :(
    // XXX But maybe if it's just a "we're offline" message we should keep
    //     going? In case we want to present the "hey there's a locally
    //     available recommended release?
    Console.debug("Errors while updating in background");
    return;
  }
};

var lastShowTimes = {};

var shouldShow = function (key, maxAge) {
  var now = +(new Date);

  if (maxAge === undefined) {
    maxAge = 12 * 60 * 60 * 1000;
  }

  var lastShow = lastShowTimes[key];
  if (lastShow !== undefined) {
    var age = now - lastShow;
    if (age < maxAge) {
      return false;
    }
  }

  lastShowTimes[key] = now;
  return true;
};

var maybeShowBanners = function () {
  var releaseData = release.current.getCatalogReleaseData();

  var banner = releaseData.banner;
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

  // We now consider printing some simpler banners, if this isn't the latest
  // release. But if the user specified a release manually with --release, we
  // don't bother: we only want to tell users about ways to update *their app*.
  if (release.forced)
    return;

  // Didn't print a banner? Maybe we have a patch release to recommend.
  var track = release.current.getReleaseTrack();
  var patchReleaseVersion = releaseData.patchReleaseVersion;
  if (patchReleaseVersion) {
    var patchRelease = catalog.official.getReleaseVersion(
      track, patchReleaseVersion);
    if (patchRelease && patchRelease.recommended) {
      var key = "patchrelease-" + track + "-" + patchReleaseVersion;
      if (shouldShow(key)) {
        runLog.log(
          "=> A patch (" +
          utils.displayRelease(track, patchReleaseVersion) +
          ") for your current release is available!");
        runLog.log("   Update this project now with 'meteor update --patch'.");
      }
      return;
    }
  }

  // There's no patch (so no urgent exclamation!) but there may be something
  // worth mentioning.
  // XXX maybe run constraint solver to change the message depending on whether
  //     or not it will actually work?
  var currentReleaseOrderKey = releaseData.orderKey || null;
  var futureReleases = catalog.official.getSortedRecommendedReleaseVersions(
    track, currentReleaseOrderKey);
  if (futureReleases.length) {
    var key = "futurerelease-" + track + "-" + futureReleases[0];
    if (shouldShow(key)) {
      runLog.log(
        "=> " + utils.displayRelease(track, futureReleases[0]) +
        " is available. Update this project with 'meteor update'.");
    }
    return;
  }
};

// Update ~/.meteor/meteor to point to the tool binary from the tools of the
// latest recommended release on the default release track.
var updateMeteorToolSymlink = function () {
  buildmessage.assertInCapture();

  // Get the latest release version of METEOR. (*Always* of the default
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
    // The latest release from the catalog is not where the ~/.meteor/meteor
    // symlink points to. Let's make sure we have that release on disk,
    // and then update the symlink.
    try {
      var messages = buildmessage.capture(function () {
        buildmessage.enterJob({
          title: "Downloading tool package " + latestRelease.tool
        }, function () {
          tropohouse.default.maybeDownloadPackageForArchitectures({
            packageName: latestReleaseToolPackage,
            version: latestReleaseToolVersion,
            architectures: [archinfo.host()],
            silent: true
          });
        });
        _.each(latestRelease.packages, function (pkgVersion, pkgName) {
          buildmessage.enterJob({
            title: "Downloading package " + pkgName + "@" + pkgVersion
          }, function () {
            tropohouse.default.maybeDownloadPackageForArchitectures({
              packageName: pkgName,
              version: pkgVersion,
              architectures: [archinfo.host()],
              silent: true
            });
          });
        });
      });
    } catch (err) {
      return;  // since we are running in the background.
    }
    if (messages.hasMessages()) {
      return;  // since we are running in the background
    }

    var toolIsopack = new isopack.Isopack;
    toolIsopack.initFromPath(
      latestReleaseToolPackage,
      tropohouse.default.packagePath(latestReleaseToolPackage,
                                     latestReleaseToolVersion));
    var toolRecord = _.findWhere(toolIsopack.toolsOnDisk,
                                 {arch: archinfo.host()});

    // XXX maybe we shouldn't throw from this background thing
    // counter: this is super weird and should never ever happen.
    if (!toolRecord)
      throw Error("latest release has no tool?");

    tropohouse.default.replaceLatestMeteorSymlink(
      path.join(relativeToolPath, toolRecord.path, 'meteor'));
  }
};
