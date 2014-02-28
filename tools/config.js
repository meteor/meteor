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

    if (files.inCheckout()) {
      var p = path.join(files.getCurrentToolsDir(), 'universe');
      if (fs.existsSync(p))
        universe = fs.readFileSync(p, 'utf8').trim();
    }
  }

  return universe;
};

var isLocalUniverse = function () {
  return !! getUniverse().match(/^localhost(:([\d]+))?$/);
};

var localhostOffset = function (portOffset) {
  var match = getUniverse().match(/^localhost(:([\d]+))?$/);
  if (! match)
    throw new Error("not a local universe?");
  return "localhost:" + (parseInt(match[2] || "80") + portOffset);
};

var getAuthServiceHost = function () {
  if (! isLocalUniverse())
    return universe;
  else
    // Special case for local development. Point
    // $METEOR_CHECKOUT/universe at the place where you are running
    // frontpage (eg, localhost:3000), and run the accounts server ten
    // port numbers higher. Like so:
    //   cd meteor-accounts
    //   ROOT_URL=http://localhost:3010/auth curmeteor -p 3010
    return localhostOffset(10);
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
    return addScheme(getAuthServiceHost()) + "/oauth2";
  },

  // Base URL for Meteor Accounts API, typically
  // "https://www.meteor.com/api/v1". Endpoints include '/login' and
  // '/logoutById'.
  getAccountsApiUrl: function () {
    return addScheme(getAuthServiceHost()) + "/api/v1";
  },

  // URL for the DDP interface to Meteor Accounts, typically
  // "https://www.meteor.com/auth". (Really should be a ddp:// URL --
  // we'll get there soon enough.)
  getAuthDDPUrl: function () {
    return addScheme(getAuthServiceHost()) + "/auth";
  },

  // URL for the DDP interface to the package server, typically
  // "https://packages.meteor.com". (Really should be a ddp:// URL --
  // we'll get there soon enough.)
  //
  // When running everything locally, run the package server at the
  // base universe port number (that is, the Meteor Accounts port
  // number) plus 20.
  getPackageServerUrl: function () {
    var host;
    if (isLocalUniverse())
      host = localhostOffset(20);
    else
      host = getUniverse().replace(/^www\./, 'packages.');

    return addScheme(host);
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
      if (isLocalUniverse())
        throw new Error("local development of deploy server not supported");
      else
        host = getUniverse().replace(/^www\./, 'deploy.');
    }

    return addScheme(host);
  },

  // URL from which the update manifest may be fetched, eg
  // 'https://update.meteor.com/manifest.json'
  getUpdateManifestUrl: function () {
    if (isLocalUniverse())
      u = "www.meteor.com"; // localhost can't run the manifest server
    var host = getUniverse().replace(/^www\./, 'update.');

    return addScheme(host) + "/manifest.json";
  },

  // Path to file that contains our credentials for any services that
  // we're logged in to. Typically .meteorsession in the user's home
  // directory.
  getSessionFilePath: function () {
    // METEOR_SESSION_FILE is for automated testing purposes only.
    return process.env.METEOR_SESSION_FILE ||
      path.join(process.env.HOME, '.meteorsession');
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
  },

  // It's easy to forget that you're in an alternate universe (and
  // that that is the reason you're not seeing your deploys). If not
  // in production mode, print a quick hint about the universe you're
  // in.
  printUniverseBanner: function () {
    if (! config.isProduction())
      process.stderr.write('[Universe: ' + config.getUniverse() + ']\n');
  }
});
