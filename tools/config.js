var fs = require('fs');
var path = require('path');
var files = require('./files.js');
var _ = require('underscore');

// A few functions in the `meteor` tool talk to MDG servers: primarily
// checking for updates, logging into your Meteor account, and
// deploying apps to the MDG free hosting sandbox. (One day package
// publishing will also be on this list too.) These functions need
// configuration.
//
// The idea is that eventually, the `meteor` will take only one
// configuration parameter, the "universe" it is talking to, which
// defaults to "www.meteor.com". In a git checkout it can be set by
// creating a file at the root of the checkout called "universe" that
// contains the name of the universe you wish to use. Then, all other
// needed configuration is derived from the universe name.
//
// We're not quite there yet though:
// - When developing locally, you may need to set DISCOVERY_PORT (see
//   getDiscoveryPort below)
// - GALAXY can still be used to override Galaxy discovery, and
//   DELPOY_HOSTNAME can still be set to override classic-style
//   deploys
// - The update/warehouse system hasn't been touched and still has its
//   hardcoded URLs for now (update.meteor.com and
//   warehouse.meteor.com). Really, it's debatable whether these
//   should (necessarily) change when you change your universe name.

var universe;
var getUniverse = function () {
  if (! universe) {
    universe = "www.meteor.com";

    if (files.in_checkout()) {
      var p = path.join(files.getCurrentToolsDir(), 'universe');
      if (fs.existsSync(p))
        universe = fs.readFileSync(p, 'utf8').trim();
    }
  }

  return universe;
};

// Given a hostname, add "http://" or "https://" as
// appropriate. (localhost gets http; anything else is always https.)
var addScheme = function (host) {
  if (host.match(/^localhost(:\d+)?$/))
    return "http://" + host;
  else
    return "https://" + host;
};

var config = exports;
_.extend(exports, {
  // True if this the production universe (www.meteor.com)
  isProduction: function () {
    return getUniverse() === "www.meteor.com";
  },

  // The current universe name. Should be used for cosmetic purposes
  // only (displaying to the user). If you want to programmatically
  // derive configuration from it, add a new method to this file.
  getUniverse: function () {
    return getUniverse();
  },

  // Base URL for Meteor Accounts OAuth services, typically
  // "https://www.meteor.com/oauth2". Endpoints include /authorize and
  // /token.
  getOauthUrl: function () {
    return addScheme(getUniverse()) + "/oauth2";
  },

  // Base URL for Meteor Accounts API, typically
  // "https://www.meteor.com/api/v1". Endpoints include '/login' and
  // '/logoutById'.
  getAccountsApiUrl: function () {
    return addScheme(getUniverse()) + "/api/v1";
  },

  // Return the domain name of the current Meteor Accounts server in
  // use. This is used as a key for storing your Meteor Accounts
  // login token.
  getAccountsDomain: function () {
    return getUniverse();
  },

  // Deploy URL for MDG free hosting, eg 'https://deploy.meteor.com'.
  getDeployUrl: function () {
    var host;

    // Support the old DEPLOY_HOSTNAME environment variable for a
    // while longer. Soon, let's remove this in favor of the universe
    // scheme.
    if (process.env.DEPLOY_HOSTNAME) {
      host = process.env.DEPLOY_HOSTNAME;
      if (host.match(/^http/))
        return host; // allow it to contain a URL scheme
    } else {
      // Otherwise, base it on the universe.
      var u = getUniverse();
      if (u === "www.meteor.com") // special case
        host = "deploy.meteor.com";
      else
        host = u.replace(/^www\./, ''); // otherwise just chop off the 'www'
    }

    return addScheme(host);
  },

  // Port to use when querying URLs for the deploy server that backs
  // them, and for querying oauth clients for their oauth information
  // (so we can log into them).
  //
  // In production this should always be 443 (we *must*
  // cryptographically authenticate the server answering the query),
  // but this can be inconvenient for local development since 443 is a
  // privileged port, so you can set DISCOVERY_PORT to override. (A
  // better solution would probably be to spin up a local VM.)
  getDiscoveryPort: function () {
    if (process.env.DISCOVERY_PORT)
      return parseInt(process.env.DISCOVERY_PORT);
    else
      return 443;
  }
});
