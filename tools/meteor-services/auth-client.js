var auth = require('./auth.js');
var Console = require('../console/console.js').Console;
var ServiceConnection = require('./service-connection.js');
var httpHelpers = require('../utils/http-helpers.js');

exports.AlreadyPrintedMessageError = function () {};

// Opens a DDP connection to a package server. Loads the packages needed for a
// DDP connection, then calls DDP connect to the package server URL in config,
// using a current user-agent header composed by http-helpers.js.
exports.openServiceConnection = async function (serverUrl) {
  const connection = new ServiceConnection(
      serverUrl,
      {headers: {"User-Agent": httpHelpers.getUserAgent()},
        _dontPrintErrors: true});

  await connection.init();
  return connection;
};


// Handle an error thrown on attempting to connect. Print a message if it is a
// known error type, else throw the error.
//
// err: error
// label: name of the service that we are trying to use (ex: "package server")
exports.handleConnectionError = function (error, label) {
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
exports.loggedInConnection = async function (url, domain, sessionType) {
  // Make sure that we are logged in with Meteor Accounts so that we can
  // do an OAuth flow.
  if (await auth.maybePrintRegistrationLink({ onlyAllowIfRegistered: true })) {
    // Oops, we're logged in but with a deferred-registration account.
    // Message has already been printed.
    throw new exports.AlreadyPrintedMessageError;
  }

  if (! auth.isLoggedIn()) {
    // XXX we should have a better account signup page.
    Console.error(
      "Please log in with your Meteor developer account.",
      "If you don't have one,",
      "you can quickly create one at www.meteor.com.");
    await auth.doUsernamePasswordLogin({ retry: true });
  }

  var conn = await exports.openServiceConnection(url);
  var accountsConfiguration = await auth.getAccountsConfiguration(conn);
  try {
    await auth.loginWithTokenOrOAuth(
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
      Console.error(
        "It looks like you have been logged out!",
        "Please log in with your Meteor developer account. If you don't have",
        "one, you can quickly create one at www.meteor.com.");
      await auth.doUsernamePasswordLogin({ retry: true });
      await auth.loginWithTokenOrOAuth(
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
