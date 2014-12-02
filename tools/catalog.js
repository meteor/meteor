var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var util = require('util');
var buildmessage = require('./buildmessage.js');
var tropohouse = require('./tropohouse.js');
var localCatalog = require('./catalog-local.js');
var remoteCatalog = require('./catalog-remote.js');
var files = require('./files.js');
var utils = require('./utils.js');
var config = require('./config.js');
var packageClient = require('./package-client.js');
var Console = require('./console.js').Console;

var catalog = exports;

catalog.refreshFailed = undefined;

catalog.Refresh = {};

// Refresh strategy: once at program start
catalog.Refresh.OnceAtStart = function (options) {
  var self = this;
  self.options = _.extend({}, options);
};

catalog.Refresh.OnceAtStart.prototype.beforeCommand = function () {
  var self = this;
  if (!catalog.refreshOrWarn(self.options)) {
    if (self.options.ignoreErrors) {
      Console.debug("Failed to update package catalog, but will continue.");
    } else {
      Console.printError(catalog.refreshError);
      Console.error("This command requires an up-to-date package catalog.  Exiting.");
      // Avoid circular dependency.
      throw new (require('./main.js').ExitWithCode)(1);
    }
  }
};

// Refresh strategy: never (we don't use the package catalog)
catalog.Refresh.Never = function (options) {
  var self = this;
  self.options = _.extend({}, options);
  self.doesNotUsePackages = true;
};

// Refreshes the catalog. Returns true on success.
// On network error, warns and returns false.
// Throws other errors (ie, programming errors in the tool).
//
// THIS IS A HIGH-LEVEL UI COMMAND. DO NOT CALL IT FROM LOW-LEVEL CODE (ie, call
// it only from main.js or command implementations).
catalog.refreshOrWarn = function (options) {
  try {
    catalog.official.refresh(options);
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
// A LayeredCatalog typically contains:
//  - a local catalog referencing the packages of the project
//  - a reference to the official catalog
var LayeredCatalog = function() {
  var self = this;

  self.localCatalog = null;
  self.otherCatalog = null;
};

_.extend(LayeredCatalog.prototype, {
  toString: function () {
    var self = this;
    return "LayeredCatalog []";
  },

  setCatalogs: function(local, remote) {
    var self = this;
    self.localCatalog = local;
    self.otherCatalog = remote;
  },

  getLatestVersion: function (name) {
    var self = this;
    return self._returnFirst("getLatestVersion", arguments, ACCEPT_NON_EMPTY);
  },

  getAllPackageNames: function () {
    var self = this;
    return _.union(self.localCatalog.getAllPackageNames(), self.otherCatalog.getAllPackageNames());
  },

  _returnFirst: function(f, args, validityOracle) {
    var self = this;
    var splittedArgs = Array.prototype.slice.call(args,0);
    var result = self.localCatalog[f].apply(self.localCatalog, splittedArgs);
    if (validityOracle(result)) {
      return result;
    }
    return self.otherCatalog[f].apply(self.otherCatalog, splittedArgs);
  },

  getLocalPackageNames: function () {
    return this.localCatalog.getAllPackageNames();
  },

  getPackageSource: function (packageName) {
    return this.localCatalog.getPackageSource(packageName);
  },

  getPackage: function (name) {
    return this._returnFirst("getPackage", arguments, ACCEPT_NON_EMPTY);
  },

  getSortedVersions: function (name) {
    return this._returnFirst("getSortedVersions", arguments, ACCEPT_NON_EMPTY);
  },

  getSortedVersionRecords: function (name) {
    return this._returnFirst(
      "getSortedVersionRecords", arguments, ACCEPT_NON_EMPTY);
  },

  getVersion: function (name, version) {
    var self = this;
    var result = self.localCatalog.getVersion(name, version);
    if (!result) {
      if (/\+/.test(version)) {
        return null;
      }
      result = self.otherCatalog.getVersion(name, version);
    }
    return result;
  },

  initialize: function (options) {
    this.localCatalog.initialize(options);
  },

  reset: function () {
    this.localCatalog.reset();
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  // It does not include prereleases (with dashes in the version);
  getLatestMainlineVersion: function (name) {
    var self = this;

    var versions = self.getSortedVersions(name);
    versions.reverse();
    var latest = _.find(versions, function (version) {
      return !/-/.test(version);
    });
    if (!latest)
      return null;
    return self.getVersion(name, latest);
  }
});

exports.DEFAULT_TRACK = remoteCatalog.DEFAULT_TRACK;
exports.official = remoteCatalog.official;

// This is the catalog that's used to actually drive the constraint solver: it
// contains local packages, and since local packages always beat server
// packages, it doesn't contain any information about the server version of
// local packages.
exports.LayeredCatalog = LayeredCatalog;
