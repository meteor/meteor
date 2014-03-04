var auth = require('./auth.js');
var config = require('./config.js');
var httpHelpers = require('./http-helpers.js');
var release = require('./release.js');
var Future = require('fibers/future');
var _ = require('underscore');

var getLoadedPackages = _.once(function () {
  var unipackage = require('./unipackage.js');
  return unipackage.load({
    library: release.current.library,
    packages: [ 'meteor', 'livedata', 'minimongo', 'mongo-livedata' ],
    release: release.current.name
  });
});

var openPackageServerConnection = function () {
  var DDP = getLoadedPackages().livedata.DDP;
  return DDP.connect(config.getPackageServerUrl(), {
    headers: { 'User-Agent': httpHelpers.getUserAgent() }
  });
};

// Returns a logged-in DDP connection to the package server, or null if
// we cannot log in.
// XXX needs a timeout
exports.loggedInPackagesConnection = function () {
  // Make sure that we are logged in with Meteor Accounts so that we can
  // do an OAuth flow.
  if (! auth.isLoggedIn()) {
    auth.doUsernamePasswordLogin({ retry: true });
  }

  var conn = openPackageServerConnection();

  var setUpOnReconnect = function () {
    conn.onReconnect = function () {
      conn.apply('login', [{
        resume: auth.getSessionToken(config.getPackageServerDomain())
      }], { wait: true }, function () { });
    };
  };

  // Subscribe to the package server's service configurations so that we
  // can get the OAuth client ID to kick off the OAuth flow.
  var serviceConfigurations = new (getLoadedPackages().meteor.Meteor.Collection)(
    'meteor_accounts_loginServiceConfiguration',
    { connection: conn }
  );
  var serviceConfigurationsSub = conn.
        _subscribeAndWait('meteor.loginServiceConfiguration');

  var accountsConfiguration = serviceConfigurations.findOne({
    service: 'meteor-developer'
  });

  var cleanUp = function () {
    serviceConfigurationsSub.stop();
    conn.close();
  };

  if (! accountsConfiguration || ! accountsConfiguration.clientId) {
    cleanUp();
    return null;
  }

  var clientId = accountsConfiguration.clientId;
  var loginResult;

  // Try to log in with an existing login token, if we have one.
  var existingToken = auth.getSessionToken(config.getPackageServerDomain());
  if (existingToken) {
    loginResult = conn.apply('login', [{
      resume: existingToken
    }], { wait: true });

    if (loginResult && loginResult.token && loginResult.id) {
      // Success!
      setUpOnReconnect();
      return conn;
    }
  }

  // Either we didn't have an existing token, or it didn't work. Do an
  // OAuth flow to log in.
  var redirectUri = config.getPackageServerUrl() +
        '/_oauth/meteor-developer?close';
  loginResult = auth.oauthFlow(conn, {
    clientId: clientId,
    redirectUri: redirectUri,
    domain: config.getPackageServerDomain(),
    sessionType: 'package-server'
  });

  if (loginResult && ! loginResult.error) {
    setUpOnReconnect();
    return conn;
  } else {
    process.stderr.write('Error logging in to package server: ' +
                         loginResult.error + '\n');
    cleanUp();
    return null;
  }
};
