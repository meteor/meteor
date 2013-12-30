// During automated QA of the updater, modify this file to set testingUpdater to
// true. This will make it act as if it is at version 0.1.0 and use test URLs
// for update checks.
var testingUpdater = false;

var inFiber = require('./fiber-helpers.js').inFiber;
var files = require('./files.js');
var warehouse = require('./warehouse.js');
var httpHelpers = require('./http-helpers.js');
var config = require('./config.js');

if (testingUpdater)
  config.setTestingUpdater(true);

/**
 * Downloads the current manifest file and returns it via a callback (or
 * null on error)
 */
exports.getManifest = function () {
  return httpHelpers.getUrl({
    url: config.getUpdateManifestUrl(),
    json: true,
    useSessionHeader: true
  });
};

/**
 * Call inside a fiber. Check for updates once, blocking as necessary,
 * and then return. If an update is found, download and install it.
 * If 'silent' is true, suppress chatter.
 */
exports.performOneUpdateCheck = function (silent) {
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
      if (! silent) {
        console.log();
        console.log(manifest.releases.stable.banner);
        console.log();
      }
      warehouse.writeLastPrintedBannerRelease(manifestLatestRelease);
    } else {
      // Already printed this banner, or maybe there is no banner.
      if (! silent) {
        console.log("=> Meteor %s is being downloaded in the background.",
                    manifestLatestRelease);
      }
    }
    try {
      warehouse.fetchLatestRelease(true /* background */);
    } catch (e) {
      // oh well, this was the background. no need to show any errors.
      return;
    }
    // We should now have fetched the latest release, which *probably* is
    // manifestLatestRelease. As long as it's changed from the one it was
    // before we tried to fetch it, print that out.
    var newLatestRelease = warehouse.latestRelease();
    if (newLatestRelease !== localLatestRelease && ! silent) {
      console.log(
        "=> Meteor %s is available. Update this project with 'meteor update'.",
        newLatestRelease);
    }
    return;
  }

  // We didn't do a global update (or we're not online), but do we need to
  // update this app? Specifically: is our local latest release something
  // other than this app's release, and the user didn't specify a specific
  // release at the command line with --release?
  if (localLatestRelease !== release.current.name &&
      ! release.forced &&
      ! silent) {
    console.log(
      "=> Meteor %s is available. Update this project with 'meteor update'.",
      localLatestRelease);
  }
};

exports.startUpdateChecks = function () {
  var updateCheck = inFiber(function () {
    exports.performOneUpdateCheck(false);
  });
  setInterval(updateCheck, 12*60*60*1000); // twice a day
  updateCheck(); // and now.
};
