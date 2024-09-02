var _ = require('underscore');

var runLog = require('../runners/run-log.js');
var catalog = require('./catalog/catalog.js');
var archinfo = require('../utils/archinfo');
var isopack = require('../isobuild/isopack.js');
var buildmessage = require('../utils/buildmessage.js');
var Console = require('../console/console.js').Console;
var auth = require('../meteor-services/auth.js');
var files = require('../fs/files');

var tropohouse = require('./tropohouse.js');
var release = require('./release.js');
var packageMapModule = require('./package-map.js');

/**
 * Check to see if an update is available. If so, download and install
 * it before returning.
 *
 * options: showBanner
 */
var checkInProgress = false;
exports.tryToDownloadUpdate = async function (options) {
  options = options || {};
  // Don't run more than one check simultaneously. It should be
  // harmless but having two downloads happening simultaneously (and
  // two sets of messages being printed) would be confusing.
  if (checkInProgress) {
    return;
  }
  checkInProgress = true;
  await checkForUpdate(!! options.showBanner, !! options.printErrors);
  checkInProgress = false;
};

var firstCheck = true;

var checkForUpdate = async function (showBanner, printErrors) {
  // While we're doing background stuff, try to revoke any old tokens in our
  // session file.
  await auth.tryRevokeOldTokens({ timeout: 15 * 1000 });

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
      await catalog.official.refresh();
    } catch (err) {
      Console.debug("Failed to refresh catalog, ignoring error", err);
      return;
    }
  }

  if (!release.current.isProperRelease()) {
    return;
  }

  await maybeShowBanners();
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

var maybeShowBanners = async function () {
  var releaseData = release.current.getCatalogReleaseData();

  var banner = releaseData.banner;
  if (banner) {
    var bannerDate =
          banner.lastUpdated ? new Date(banner.lastUpdated) : new Date;
    if (await catalog.official.shouldShowBanner(release.current.name, bannerDate)) {
      // This banner is new; print it!
      runLog.log("");
      runLog.log(banner.text);
      runLog.log("");
      await catalog.official.setBannerShownDate(release.current.name, bannerDate);
      return;
    }
  }

  // We now consider printing some simpler banners, if this isn't the latest
  // release. But if the user specified a release manually with --release, we
  // don't bother: we only want to tell users about ways to update *their app*.
  if (release.forced) {
    return;
  }

  const catalogUtils = require('./catalog/catalog-utils.js');

  // Didn't print a banner? Maybe we have a patch release to recommend.
  var track = await release.current.getReleaseTrack();
  var patchReleaseVersion = releaseData.patchReleaseVersion;
  if (patchReleaseVersion) {
    var patchRelease = await catalog.official.getReleaseVersion(
      track, patchReleaseVersion);
    if (patchRelease && patchRelease.recommended) {
      var patchKey = "patchrelease-" + track + "-" + patchReleaseVersion;
      if (shouldShow(patchKey)) {
        runLog.log(
          "=> A patch (" +
          catalogUtils.displayRelease(track, patchReleaseVersion) +
          ") for your current release is available!");
        runLog.log("   Check the changelog https://docs.meteor.com/changelog.html and update this project now with 'meteor update --patch'.");
      }
      return;
    }
  }

  // There's no patch (so no urgent exclamation!) but there may be something
  // worth mentioning.
  // XXX maybe run constraint solver to change the message depending on whether
  //     or not it will actually work?
  var currentReleaseOrderKey = releaseData.orderKey || null;
  var futureReleases = await catalog.official.getSortedRecommendedReleaseVersions(
    track, currentReleaseOrderKey);
  if (futureReleases.length) {
    var futureReleaseKey = "futurerelease-" + track + "-" + futureReleases[0];
    if (shouldShow(futureReleaseKey)) {
      runLog.log(
        "=> " + catalogUtils.displayRelease(track, futureReleases[0]) +
        " is available. Check the changelog https://docs.meteor.com/history.html and update this project with 'meteor update'.");
    }
    return;
  }
};

// Update ~/.meteor/meteor to point to the tool binary from the tools of the
// latest recommended release on the default release track.
export async function updateMeteorToolSymlink(printErrors) {
  // Get the latest release version of METEOR. (*Always* of the default
  // track, not of whatever we happen to be running: we always want the tool
  // symlink to go to the default track.)
  var latestReleaseVersion = await catalog.official.getDefaultReleaseVersion();
  // Maybe you're on some random track with nothing recommended. That's OK.
  if (!latestReleaseVersion) {
    return;
  }

  var latestRelease = await catalog.official.getReleaseVersion(
    latestReleaseVersion.track, latestReleaseVersion.version);
  if (!latestRelease) {
    throw Error("latest release doesn't exist?");
  }
  if (!latestRelease.tool) {
    throw Error("latest release doesn't have a tool?");
  }

  var latestReleaseToolParts = latestRelease.tool.split('@');
  var latestReleaseToolPackage = latestReleaseToolParts[0];
  var latestReleaseToolVersion = latestReleaseToolParts[1];
  var relativeToolPath = tropohouse.default.packagePath(
    latestReleaseToolPackage, latestReleaseToolVersion, true);

  var localLatestReleaseLink = tropohouse.default.latestMeteorSymlink();

  if (! localLatestReleaseLink.startsWith(relativeToolPath + files.pathSep)) {
    // The latest release from the catalog is not where the ~/.meteor/meteor
    // symlink points to. Let's make sure we have that release on disk,
    // and then update the symlink.
    var packageMap =
          packageMapModule.PackageMap.fromReleaseVersion(latestRelease);
    var messages = await buildmessage.capture(async function () {
      await tropohouse.default.downloadPackagesMissingFromMap(packageMap);
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
    await toolIsopack.initFromPath(
      latestReleaseToolPackage,
      tropohouse.default.packagePath(latestReleaseToolPackage,
                                     latestReleaseToolVersion));

    var toolRecord = null;
    archinfo.acceptableMeteorToolArches().some(arch => {
      return toolRecord = _.findWhere(toolIsopack.toolsOnDisk, { arch });
    });

    // XXX maybe we shouldn't throw from this background thing
    // counter: this is super weird and should never ever happen.
    if (!toolRecord) {
      throw Error("latest release has no tool?");
    }

    await tropohouse.default.linkToLatestMeteor(files.pathJoin(
      relativeToolPath, toolRecord.path, 'meteor'));
  }
}
