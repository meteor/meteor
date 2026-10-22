var _ = require('underscore');
var remoteCatalog = require('./catalog-remote.js');
var Console = require('../../console/console.js').Console;
var buildmessage = require('../../utils/buildmessage.js');

var catalog = exports;

catalog.refreshFailed = undefined;
catalog.triedToRefreshRecently = false;

catalog.Refresh = {};

// Refresh strategy: once at program start
catalog.Refresh.OnceAtStart = function (options) {
  var self = this;
  self.options = Object.assign({}, options);
};

catalog.Refresh.OnceAtStart.prototype.beforeCommand = async function () {
  var self = this;
  if (!await catalog.refreshOrWarn(self.options)) {
    if (self.options.ignoreErrors) {
      Console.debug("Failed to update package catalog, but will continue.");
    } else {
      Console.printError(catalog.refreshError);
      Console.error("This command requires an up-to-date package catalog.  Exiting.");
      // Avoid circular dependency.
      throw new (require('../../cli/main.js').ExitWithCode)(1);
    }
  }
};

// Refresh strategy: never (we don't use the package catalog)
catalog.Refresh.Never = function (options) {
  var self = this;
  self.options = Object.assign({}, options);
};

// Refreshes the catalog. Returns true on success.
// On network error, warns and returns false.
// Throws other errors (ie, programming errors in the tool).
//
// THIS IS A HIGH-LEVEL UI COMMAND. DO NOT CALL IT FROM LOW-LEVEL CODE (ie, call
// it only from main.js or command implementations).
catalog.refreshOrWarn = async function (options) {
  catalog.triedToRefreshRecently = true;
  try {
    await catalog.official.refresh(options);
    catalog.refreshFailed = false;
    return true;
  } catch (err) {
    // Example errors:

    // Offline, with name-based host:
    //   Network error: ws://packages.meteor.com/websocket: getaddrinfo ENOTFOUND

    // Offline, with IP-based host:
    //   Network error: ws://8.8.8.8/websocket: connect ENETUNREACH

    // Online, bad port:
    //    Network error: wss://packages.meteor.com:8888/websocket: connect ECONNREFUSED

    // Online, socket hangup:
    //   Network error: wss://packages.meteor.com:80/websocket: socket hang up

    if (err.errorType !== 'DDP.ConnectionError')
      throw err;

    // XXX is throwing correct for SQLite errors too? probably.

    Console.warn("Unable to update package catalog (are you offline?)");
    Console.warn();
    Console.warn(
      "If you are using Meteor behind a proxy, set HTTP_PROXY and HTTPS_PROXY environment variables or see this page for more details: ",
      Console.url("https://github.com/meteor/meteor/wiki/Using-Meteor-behind-a-proxy"));

    // XXX: Make this Console.debug(err)
    if (Console.isDebugEnabled()) {
      Console.printError(err);
    }

    Console.warn();

    catalog.refreshFailed = true;
    catalog.refreshError = err;
    return false;
  }
};

// Runs 'attempt'; if it fails in a way that can be fixed by refreshing the
// official catalog, does that and tries again.
catalog.runAndRetryWithRefreshIfHelpful = async function (attempt) {
  buildmessage.assertInJob();

  var canRetry = ! (catalog.triedToRefreshRecently ||
                    catalog.official.offline);

  // Run `attempt` in a nested buildmessage context.
  var messages = await buildmessage.capture(async function () {
    await attempt(canRetry);
  });

  // Did it work? Great.
  if (! messages.hasMessages()) {
    return;
  }

  // Is refreshing unlikely to be useful, either because the error wasn't
  // related to that, or because we tried to refresh recently, or because we're
  // not allowed to refresh? Fail, merging the result of these errors into the
  // current job.
  if (! (messages.hasMessageWithTag('refreshCouldHelp') && canRetry)) {
    buildmessage.mergeMessagesIntoCurrentJob(messages);
    return;
  }

  // Refresh!
  // XXX This is a little hacky, as it shares a bunch of code with
  // catalog.refreshOrWarn, which is a higher-level function that's allowed to
  // log.
  catalog.triedToRefreshRecently = true;
  try {
    await catalog.official.refresh();
    catalog.refreshFailed = false;
  } catch (err) {
    if (err.errorType !== 'DDP.ConnectionError')
      throw err;
    // First place the previous errors in the capture.
    buildmessage.mergeMessagesIntoCurrentJob(messages);
    // Then put an error representing this DDP error.
    await buildmessage.enterJob(
      "refreshing package catalog to resolve previous errors",
      function () {
        return buildmessage.error(err.message);
      }
    );
    return;
  }

  // Try again, this time directly in the current buildmessage job.
  await attempt(false); // canRetry = false
};

// As a work-around for [] !== [], we use a function to check whether values are acceptable
var ACCEPT_NON_EMPTY = function (result) {
  // null, undefined
  if (result === null || result === undefined) {
    return false;
  }
  // []
  if (result.length === 0) {
    return false;
  }
  return true;
};

// The LayeredCatalog provides a way to query multiple catalogs in a uniform way
// A LayeredCatalog contains:
//  - a local catalog referencing the packages of the project
//  - a reference to the official catalog
var LayeredCatalog = function (localCatalog, otherCatalog) {
  var self = this;

  self.localCatalog = localCatalog;
  self.otherCatalog = otherCatalog;
};

Object.assign(LayeredCatalog.prototype, {
  toString: function () {
    var self = this;
    return "LayeredCatalog []";
  },

  getLatestVersion: function (...args) {
    var self = this;
    return self._returnFirst("getLatestVersion", args, ACCEPT_NON_EMPTY);
  },

  getAllPackageNames: function () {
    var self = this;
    return _.union(self.localCatalog.getAllPackageNames(), self.otherCatalog.getAllPackageNames());
  },

  _returnFirst: function(f, args, validityOracle) {
    var self = this;
    var result = self.localCatalog[f](...args);
    if (validityOracle(result)) {
      return result;
    }
    return self.otherCatalog[f](...args);
  },

  getPackage: function (...args) {
    return this._returnFirst("getPackage", args, ACCEPT_NON_EMPTY);
  },

  getSortedVersions: function (...args) {
    return this._returnFirst("getSortedVersions", args, ACCEPT_NON_EMPTY);
  },

  getSortedVersionRecords: function (...args) {
    return this._returnFirst(
      "getSortedVersionRecords", args, ACCEPT_NON_EMPTY);
  },

  getVersion: async function (name, version) {
    var self = this;
    var result = self.localCatalog.getVersion(name, version);
    if (!result) {
      if (/\+/.test(version)) {
        return null;
      }
      result = await self.otherCatalog.getVersion(name, version);
    }
    return result;
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  // It does not include prereleases (with dashes in the version);
  getLatestMainlineVersion: async function (name) {
    var self = this;

    var versions = await self.getSortedVersions(name);
    versions.reverse();
    var latest = versions.find(function (version) {
      return !/-/.test(version);
    });
    if (!latest)
      return null;
    return await self.getVersion(name, latest);
  }
});

exports.DEFAULT_TRACK = remoteCatalog.DEFAULT_TRACK;
exports.official = remoteCatalog.official;

// This is the catalog that's used to actually drive the constraint solver: it
// contains local packages, and since local packages always beat server
// packages, it doesn't contain any information about the server version of
// local packages.
exports.LayeredCatalog = LayeredCatalog;
