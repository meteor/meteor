var url = require('url');
var files = require('../fs/files.js');
var _ = require('underscore');
var tropohouse = require('../packaging/tropohouse.js');

// A few functions in the `meteor` tool talk to MDG servers: primarily
// checking for updates, logging into your Meteor account, and
// deploying apps to the MDG free hosting sandbox, publishing packages,
// getting an ssh access to a build farm. These functions need
// configuration.

var config = exports;
_.extend(exports, {
  // Base URL for Meteor Accounts OAuth services. Endpoints include /authorize
  // and /token.
  getOauthUrl: function () {
    return "https://www.meteor.com/oauth2";
  },

  // Base URL for Meteor Accounts API. Endpoints include '/login' and
  // '/logoutById'.
  getAccountsApiUrl: function () {
    return "https://www.meteor.com/api/v1";
  },

  // URL for the DDP interface to Meteor Accounts.
  getAuthDDPUrl: function () {
    return "https://www.meteor.com/auth";
  },

  // URL for the DDP interface to the meteor build farm, typically
  // "https://build.meteor.com".
  getBuildFarmUrl: function () {
    return process.env.METEOR_BUILD_FARM_URL || "https://build.meteor.com";
  },

  getBuildFarmDomain: function () {
    return url.parse(config.getBuildFarmUrl()).host;
  },

  // URL for the DDP interface to the package server, typically
  // "https://packages.meteor.com".
  getPackageServerUrl: function () {
    return process.env.METEOR_PACKAGE_SERVER_URL ||
      "https://packages.meteor.com";
  },

  getPackageServerDomain: function () {
    return url.parse(config.getPackageServerUrl()).host;
  },

  getPackageStatsServerUrl: function () {
    return process.env.METEOR_PACKAGE_STATS_SERVER_URL ||
      "https://activity.meteor.com";
  },

  getPackageStatsServerDomain: function () {
    return url.parse(config.getPackageStatsServerUrl()).host;
  },

  // Note: this is NOT guaranteed to return a distinct prefix for every
  // conceivable URL.  But it sure ought to return a distinct prefix for every
  // server we actually use.
  getPackageServerFilePrefix: function (serverUrl) {
    var self = this;
    if (!serverUrl) {
      serverUrl = self.getPackageServerUrl();
    }

    // Chop off http:// and https:// and trailing slashes.
    serverUrl = serverUrl.replace(/^\https:\/\//, '');
    serverUrl = serverUrl.replace(/^\http:\/\//, '');
    serverUrl = serverUrl.replace(/\/+$/, '');

    // Chop off meteor.com.
    serverUrl = serverUrl.replace(/\.meteor\.com$/, '');

    // Replace other weird stuff with X.
    serverUrl = serverUrl.replace(/[^a-zA-Z0-9.-]/g, 'X');

    return serverUrl;
  },

  getPackagesDirectoryName: function (serverUrl) {
    var self = this;

    var prefix = config.getPackageServerFilePrefix(serverUrl);
    if (prefix !== 'packages') {
      prefix = files.pathJoin('packages-from-server', prefix);
    }

    return prefix;
  },

  getLocalPackageCacheFilename: function (serverUrl) {
    var self = this;
    var prefix = self.getPackageServerFilePrefix(serverUrl);

    // Should look like 'packages.data.db' in the default case
    // (packages.data.json before 0.9.4).
    return prefix + ".data.db";
  },

  getPackageStorage: function (options) {
    var self = this;
    options = options || {};
    var root = options.root || tropohouse.default.root;
    return files.pathJoin(root, "package-metadata", "v2.0.1",
                     self.getLocalPackageCacheFilename(options.serverUrl));
  },

  getIsopacketRoot: function () {
    if (files.inCheckout()) {
      return files.pathJoin(files.getCurrentToolsDir(), '.meteor', 'isopackets');
    } else {
      return files.pathJoin(files.getCurrentToolsDir(), 'isopackets');
    }
  },

  // Return the domain name of the current Meteor Accounts server in
  // use. This is used as a key for storing your Meteor Accounts
  // login token.
  getAccountsDomain: function () {
    return "www.meteor.com";
  },

  // Path to file that contains our credentials for any services that
  // we're logged in to. Typically .meteorsession in the user's home
  // directory.
  getSessionFilePath: function () {
    // METEOR_SESSION_FILE is for automated testing purposes only.
    return process.env.METEOR_SESSION_FILE ||
      files.pathJoin(files.getHomeDir(), '.meteorsession');
  }
});
