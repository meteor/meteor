var auth = require('./auth.js');
var Console = require('./console.js').Console;
var ServiceConnection = require('./service-connection.js');
var httpHelpers = require('./http-helpers.js');
var uniload = require('./uniload.js');

exports.AlreadyPrintedMessageError = function () {};

// Use uniload to load the packages that we need to open a meteor developer
// accounts ddp connection.
//
// meteor: base package and prerequsite for all others.
// ddp: DDP client interface to make a connection to the package server.
var getDDPPackages = function () {
  return uniload.load({
    packages: [ 'meteor', 'ddp']
  });
};

// Opens a DDP connection to a package server. Loads the packages needed for a
// DDP connection, then calls DDP connect to the package server URL in config,
// using a current user-agent header composed by http-helpers.js.
exports.openServiceConnection = function (serverUrl) {
  return new ServiceConnection(
    getDDPPackages(),
    serverUrl,
    {headers: {"User-Agent": httpHelpers.getUserAgent()},
     _dontPrintErrors: true});
};


// Handle an error thrown on attempting to connect. Print a message if it is a
// known error type, else throw the error.
//
// err: error
// label: name of the service that we are trying to use (ex: "package server")
exports.handlerConnectionError = function (error, label) {
  if (error instanceof exports.AlreadyPrintedMessageError) {
    // do nothing
  } else if (error.errorType === 'Meteor.Error') {
    var errorMsg = "Error from " + label;
    if (error.message) {
      errorMsg += ": " + error.message;
    }
    Console.warn(errorMsg);
  } else if (error.errorType === "DDP.ConnectionError") {
    Console.warn("Error connecting to " + label + ": "
                 + error.message);
  } else {
    throw error;
  }
};

// Returns a logged-in DDP connection to the given URL, or null if
// we cannot log in. If an error unrelated to login occurs
// (e.g. connection to package server times out), then it will be
// thrown.
//
//  url: the url of the connection (ex: config.getPackageServerUrl)
//  domain: the domain (ex: packages.meteor.com)
//  sessionType: the name of the connection (ex: "package-server")
//
exports.loggedInConnection = function (url, domain, sessionType) {
  // Make sure that we are logged in with Meteor Accounts so that we can
  // do an OAuth flow.
  if (auth.maybePrintRegistrationLink({onlyAllowIfRegistered: true})) {
    // Oops, we're logged in but with a deferred-registration account.
    // Message has already been printed.
    throw new exports.AlreadyPrintedMessageError;
  }

  if (! auth.isLoggedIn()) {
    // XXX we should have a better account signup page.
    Console.stderr.write(
"Please log in with your Meteor developer account. If you don't have one,\n" +
"you can quickly create one at www.meteor.com.\n");
    auth.doUsernamePasswordLogin({ retry: true });
  }

  var conn = exports.openServiceConnection(url);
  var accountsConfiguration = auth.getAccountsConfiguration(conn);
  try {
    auth.loginWithTokenOrOAuth(
      conn,
      accountsConfiguration,
      url,
      domain,
      sessionType
    );
  } catch (err) {
    if (err.message === "access-denied") {
      // Maybe we thought we were logged in, but our token had been
      // revoked.
      Console.stderr.write(
"It looks like you have been logged out! Please log in with your Meteor\n" +
"developer account. If you don't have one, you can quickly create one\n" +
"at www.meteor.com.\n");
      auth.doUsernamePasswordLogin({ retry: true });
      auth.loginWithTokenOrOAuth(
        conn,
        accountsConfiguration,
        url,
        domain,
        sessionType
      );
    } else {
      throw err;
    }
  }
  return conn;
};
