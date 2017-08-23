import { parse as urlParse } from 'url';
import {
  pathJoin,
  getCurrentToolsDir,
  getHomeDir,
  inCheckout,
} from '../fs/files.js';
import tropohouse from '../packaging/tropohouse.js';

// A few functions in the `meteor` tool talk to MDG servers: primarily
// checking for updates, logging into your Meteor account, and
// deploying apps to the MDG free hosting sandbox, publishing packages,
// getting an ssh access to a build farm. These functions need
// configuration.

// Base URL for Meteor Accounts OAuth services. Endpoints include /authorize
// and /token.
export function getOauthUrl() {
  return "https://www.meteor.com/oauth2";
}

// Base URL for Meteor Accounts API. Endpoints include '/login' and
// '/logoutById'.
export function getAccountsApiUrl() {
  return "https://www.meteor.com/api/v1";
}

// URL for the DDP interface to Meteor Accounts.
export function getAuthDDPUrl() {
  return "https://www.meteor.com/auth";
}

// URL for the DDP interface to the meteor build farm, typically
// "https://build.meteor.com".
export function getBuildFarmUrl() {
  return process.env.METEOR_BUILD_FARM_URL || "https://build.meteor.com";
}

export function getBuildFarmDomain() {
  return urlParse(getBuildFarmUrl()).host;
}

// URL for the DDP interface to the package server, typically
// "https://packages.meteor.com".
export function getPackageServerUrl() {
  return process.env.METEOR_PACKAGE_SERVER_URL ||
    "https://packages.meteor.com";
}

export function getPackageServerDomain() {
  return urlParse(getPackageServerUrl()).host;
}

export function getPackageStatsServerUrl() {
  return process.env.METEOR_PACKAGE_STATS_SERVER_URL ||
    "https://activity.meteor.com";
}

export function getPackageStatsServerDomain() {
  return urlParse(getPackageStatsServerUrl()).host;
}

// Note: this is NOT guaranteed to return a distinct prefix for every
// conceivable URL.  But it sure ought to return a distinct prefix for every
// server we actually use.
export function getPackageServerFilePrefix(serverUrl) {
  if (!serverUrl) {
    serverUrl = getPackageServerUrl();
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
}

export function getPackagesDirectoryName(serverUrl) {
  var prefix = getPackageServerFilePrefix(serverUrl);
  if (prefix !== 'packages') {
    prefix = pathJoin('packages-from-server', prefix);
  }

  return prefix;
}

export function getLocalPackageCacheFilename(serverUrl) {
  var prefix = getPackageServerFilePrefix(serverUrl);

  // Should look like 'packages.data.db' in the default case
  // (packages.data.json before 0.9.4).
  return prefix + ".data.db";
}

export function getPackageStorage(options) {
  options = options || {};
  var root = options.root || tropohouse.default.root;
  return pathJoin(root, "package-metadata", "v2.0.1",
    getLocalPackageCacheFilename(options.serverUrl));
}

export function getIsopacketRoot() {
  if (inCheckout()) {
    return pathJoin(getCurrentToolsDir(), '.meteor', 'isopackets');
  } else {
    return pathJoin(getCurrentToolsDir(), 'isopackets');
  }
}

// Return the domain name of the current Meteor Accounts server in
// use. This is used as a key for storing your Meteor Accounts
// login token.
export function getAccountsDomain() {
  return "www.meteor.com";
}

// Path to file that contains our credentials for any services that
// we're logged in to. Typically .meteorsession in the user's home
// directory.
export function getSessionFilePath() {
  // METEOR_SESSION_FILE is for automated testing purposes only.
  return process.env.METEOR_SESSION_FILE ||
    pathJoin(getHomeDir(), '.meteorsession');
}
