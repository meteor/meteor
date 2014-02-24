var inFiber = require('./fiber-helpers.js').inFiber;
var files = require('./files.js');
var warehouse = require('./warehouse.js');
var httpHelpers = require('./http-helpers.js');
var config = require('./config.js');
var release = require('./release.js');
var runLog = require('./run-log.js').runLog;

/**
 * Downloads the current manifest file and returns it. Throws
 * files.OfflineError if we are offline, or throws some other
 * exception if the server turned down our request.
 */
exports.getManifest = function () {
  // Automated self-test support. You can set an environment variable
  // to stub out the manifest fetch with a particular value, or to
  // throw OfflineError.
  if (process.env.METEOR_TEST_UPDATE_MANIFEST === "offline")
    throw new files.OfflineError(new Error("scripted failure for tests"));
  if (process.env.METEOR_TEST_UPDATE_MANIFEST)
    return JSON.parse(process.env.METEOR_TEST_UPDATE_MANIFEST);

  return httpHelpers.getUrl({
    url: config.getUpdateManifestUrl(),
    json: true,
    useSessionHeader: true
  });
};

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
  check(!!options.showBanner);
  checkInProgress = false;
};

var check = function (showBanner) {
  var manifest = null;
  try {
    manifest = exports.getManifest();
  } catch (e) {
    // Ignore error (eg, offline), but still do the "can we update this app
    // with a locally available release" check.
  }

  if (!files.usesWarehouse())
    return;

  // XXX in the future support release channels other than stable
  var manifestLatestRelease =
    manifest && manifest.releases && manifest.releases.stable &&
    manifest.releases.stable.version;
  var localLatestRelease = warehouse.latestRelease();
  if (manifestLatestRelease && manifestLatestRelease !== localLatestRelease) {
    // The manifest is telling us about a release that isn't our latest
    // release! First, print a banner... but only if we've never printed a
    // banner for this release before. (Or, well... only if this release isn't
    // the last release which has had a banner printed.)
    if (manifest.releases.stable.banner &&
        warehouse.lastPrintedBannerRelease() !== manifestLatestRelease) {
      if (showBanner) {
        runLog.log("");
        runLog.log(manifest.releases.stable.banner);
        runLog.log("");
      }
      warehouse.writeLastPrintedBannerRelease(manifestLatestRelease);
    } else {
      // Already printed this banner, or maybe there is no banner.
      if (showBanner) {
        runLog.log("=> Meteor " + manifestLatestRelease +
                   " is being downloaded in the background.");
      }
    }
    warehouse.fetchLatestRelease();
    // We should now have fetched the latest release, which *probably* is
    // manifestLatestRelease. As long as it's changed from the one it was
    // before we tried to fetch it, print that out.
    var newLatestRelease = warehouse.latestRelease();
    if (showBanner && newLatestRelease !== localLatestRelease) {
      runLog.log(
        "=> Meteor " + newLatestRelease +
        " is available. Update this project with 'meteor update'.");
    }
    return;
  }

  // We didn't do a global update (or we're not online), but do we need to
  // update this app? Specifically: is our local latest release something
  // other than this app's release, and the user didn't specify a specific
  // release at the command line with --release?
  if (showBanner &&
      localLatestRelease !== release.current.name &&
      ! release.forced) {
    runLog.log(
      "=> Meteor " + localLatestRelease +
      " is available. Update this project with 'meteor update'.");
  }
};
