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

// XXX onReconnect
exports.loggedInPackagesConnection = function () {

  if (! auth.isLoggedIn()) {
    auth.doUsernamePasswordLogin({ retry: true });
  }

  var conn = openPackageServerConnection();
  var serviceConfigurations = new (getLoadedPackages()['meteor'].
        Meteor.Collection)('meteor_accounts_loginServiceConfiguration', {
          connection: conn
        });
  var fut = new Future();
  var serviceConfigurationsSub = conn.subscribe(
    'meteor.loginServiceConfiguration',
    fut.resolver()
  );
  fut.wait();

  var accountsConfiguration = serviceConfigurations.findOne({
    service: 'meteor-developer'
  });

  if (! accountsConfiguration) {
    return null;
  }

  var clientId = accountsConfiguration.clientId;
  var loginResult;

  if (! auth.getSessionToken(config.getPackageServerDomain())) {
    // Since we passed retry: true, we shouldn't ever get to this point
    // unless we are now logged in with the accounts server.
    var redirectUri = config.getPackageServerUrl() +
          '/_oauth/meteor-developer?close';
    loginResult = auth.oauthFlow(conn, clientId, redirectUri,
                                     config.getPackageServerDomain(),
                                     'package-server');
    if (! loginResult) {
      conn.close();
      return null;
    }
  } else {
    loginResult = conn.apply('login', [{
      resume: auth.getSessionToken(config.getPackageServerDomain())
    }], { wait: true });
    if (! loginResult || ! loginResult.token || ! loginResult.id) {
      conn.close();
      return null;
    }
  }
  return conn;
};
