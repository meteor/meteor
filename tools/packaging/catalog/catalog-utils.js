exports.splitReleaseName = function (releaseName) {
  var parts = releaseName.split('@');
  var track, version;
  if (parts.length === 1) {
    var catalog = require('./catalog.js');
    track = catalog.DEFAULT_TRACK;
    version = parts[0];
  } else {
    track = parts[0];
    // Do we forbid '@' sign in release versions? I sure hope so, but let's
    // be careful.
    version = parts.slice(1).join("@");
  }
  return [track, version];
};

// Options: noPrefix: do not display 'Meteor ' in front of the version number.
exports.displayRelease = function (track, version, options) {
  var catalog = require('./catalog.js');
  options = options || {};
  var prefix = options.noPrefix ? "" : "Meteor ";

  if (track === catalog.DEFAULT_TRACK) {
    return prefix + version;
  } else {
    return track + '@' + version;
  }
};

// If we have failed to update the catalog, informs the user and advises them to
// go online for up to date inforation.
exports.explainIfRefreshFailed = function () {
  var Console = require('../../console/console.js').Console;
  var catalog = require('./catalog.js');
  if (catalog.official.offline || catalog.refreshFailed) {
    Console.info("Your package catalog may be out of date.\n" +
      "Please connect to the internet and try again.");
  }
};
