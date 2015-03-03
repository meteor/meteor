var _ = require('underscore');
var tropohouse = require('./tropohouse.js');
var release = require('./release.js');
var runLog = require('./run-log.js');
var catalog = require('./catalog.js');
var archinfo = require('./archinfo.js');
var isopack = require('./isopack.js');
var utils = require('./utils.js');
var buildmessage = require('./buildmessage.js');
var Console = require('./console.js').Console;
var auth = require('./auth.js');
var packageMapModule = require('./package-map.js');
var files = require("./files.js");

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
  checkForUpdate(!! options.showBanner, !! options.printErrors);
  checkInProgress = false;
};

var firstCheck = true;

var checkForUpdate = function (showBanner, printErrors) {
  // While we're doing background stuff, try to revoke any old tokens in our
  // session file.
  auth.tryRevokeOldTokens({ timeout: 15 * 1000 });

  if (firstCheck) {
    // We want to avoid a potential race condition here, because we run an
    // update almost immediately at run.  We don't want to drop the resolver
    // cache; that would be slow.  "meteor run" itself should have run a refresh
    // anyway.  So, the first time, we just skip the remote catalog sync.  But
    // we do want to do the out-of-date release checks, so we can't just delay
    // the first update cycle.
    firstCheck = false;
  } else {
    try {
      catalog.official.refresh();
    } catch (err) {
      Console.debug("Failed to refresh catalog, ignoring error", err);
      return;
    }
  }

  if (!release.current.isProperRelease())
    return;

  updateMeteorToolSymlink(printErrors);

  maybeShowBanners();
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
    var bannerDate =
          banner.lastUpdated ? new Date(banner.lastUpdated) : new Date;
    if (catalog.official.shouldShowBanner(release.current.name, bannerDate)) {
      // This banner is new; print it!
      runLog.log("");
      runLog.log(banner.text);
      runLog.log("");
      catalog.official.setBannerShownDate(release.current.name, bannerDate);
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
      var patchKey = "patchrelease-" + track + "-" + patchReleaseVersion;
      if (shouldShow(patchKey)) {
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
    var futureReleaseKey = "futurerelease-" + track + "-" + futureReleases[0];
    if (shouldShow(futureReleaseKey)) {
      runLog.log(
        "=> " + utils.displayRelease(track, futureReleases[0]) +
        " is available. Update this project with 'meteor update'.");
    }
    return;
  }
};

// Update ~/.meteor/meteor to point to the tool binary from the tools of the
// latest recommended release on the default release track.
var updateMeteorToolSymlink = function (printErrors) {
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

  if (! utils.startsWith(localLatestReleaseLink, relativeToolPath + files.pathSep)) {
    // The latest release from the catalog is not where the ~/.meteor/meteor
    // symlink points to. Let's make sure we have that release on disk,
    // and then update the symlink.
    var packageMap =
          packageMapModule.PackageMap.fromReleaseVersion(latestRelease);
    var messages = buildmessage.capture(function () {
      tropohouse.default.downloadPackagesMissingFromMap(packageMap);
    });
    if (messages.hasMessages()) {
      // Ignore errors because we are running in the background, uness we
      // specifically requested to print errors because we are testing this
      // feature.
      if (printErrors) {
        Console.printMessages(messages);
      }
      return;
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

    tropohouse.default.linkToLatestMeteor(files.pathJoin(
      relativeToolPath, toolRecord.path, 'meteor'));
  }
};
