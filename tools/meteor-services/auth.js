var _ = require('underscore');
var utils = require('../utils/utils.js');
var files = require('../fs/files.js');
var config = require('./config.js');
var httpHelpers = require('../utils/http-helpers.js');
var fiberHelpers = require('../utils/fiber-helpers.js');
var querystring = require('querystring');
var url = require('url');
var Future = require('fibers/future');
var isopackets = require('../tool-env/isopackets.js');
var Console = require('../console/console.js').Console;

var auth = exports;

var getLoadedPackages = function () {
  return isopackets.load('ddp');
};

// Opens and returns a DDP connection to the accounts server. Remember
// to close it when you're done with it!
var openAccountsConnection = function () {
  var DDP = getLoadedPackages()['ddp-client'].DDP;
  return DDP.connect(config.getAuthDDPUrl(), {
    headers: { 'User-Agent': httpHelpers.getUserAgent() }
  });
};

// Returns a function that runs `f`, appending an additional argument
// that is a connection to the accounts server, which gets closed when
// `f` returns or throws.
var withAccountsConnection = function (f) {
  return function (...args) {
    var self = this;
    var conn = openAccountsConnection();
    args.push(conn);
    try {
      var result = f.apply(self, args);
    } finally {
      conn.close();
    }
    return result;
  };
};

// Open a DDP connection to the accounts server and log in using the
// provided token. Returns the connection, or null if login fails.
//
// XXX if we reconnect we won't reauthenticate. Fix that before using
// this for long-lived connections.
var loggedInAccountsConnection = function (token) {
  var connection = getLoadedPackages()['ddp-client'].DDP.connect(
    config.getAuthDDPUrl()
  );

  var fut = new Future;
  connection.apply(
    'login',
    [{ resume: token }],
    { wait: true },
    function (err, result) {
      fut['return']({ err: err, result: result });
    }
  );
  var outcome = fut.wait();

  if (outcome.err) {
    connection.close();

    if (outcome.err.error === 403) {
      // This is not an ideal value for the error code, but it means
      // "server rejected our access token". For example, it expired
      // or we revoked it from the web.
      return null;
    }

    // Something else went wrong
    throw outcome.err;
  }

  return connection;
};

// The accounts server has some wrapped methods that take and return
// session identifiers. To call these methods, we add our current
// session identifier (or null, if we don't have one) as the last
// argument to the method. The accounts server returns an object with
// keys 'result' (the actual method result) and 'session' (the new
// session identifier we should use, if it created a new session for
// us).
// options can include:
//  - timeout: a timeout after which an exception will be thrown if the
//    method hasn't returned yet
//  - connection: an open connection to the accounts server. If not
//    provided, one will be opened and then closed before returning.
var sessionMethodCaller = function (methodName, options) {
  options = options || {};
  return function (...args) {
    args.push({
      session: auth.getSessionId(config.getAccountsDomain()) || null
    });
    var fut = new Future();
    var conn = options.connection || openAccountsConnection();
    conn.apply(methodName, args, fiberHelpers.firstTimeResolver(fut));
    if (options.timeout !== undefined) {
      var timer = setTimeout(fiberHelpers.bindEnvironment(function () {
        if (!fut.isResolved()) {
          fut.throw(new Error('Method call timed out'));
        }
      }), options.timeout);
    }
    try {
      var result = fut.wait();
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      if (! options.connection) {
        conn.close();
      }
    }
    if (result && result.session) {
      auth.setSessionId(config.getAccountsDomain(), result.session);
    }
    return result && result.result;
  };
};

var readSessionData = function () {
  var sessionPath = config.getSessionFilePath();
  if (! files.exists(sessionPath)) {
    return {};
  }
  return JSON.parse(files.readFile(sessionPath, { encoding: 'utf8' }));
};

var writeSessionData = function (data) {
  var sessionPath = config.getSessionFilePath();

  var tries = 0;
  while (true) {
    if (tries++ > 10) {
      throw new Error("can't find a unique name for temporary file?");
    }

    // Create a temporary file in the same directory where we
    // ultimately want to write the session file. Use the exclusive
    // flag to atomically ensure that the file doesn't exist, create
    // it, and make it readable and writable only by the current
    // user (mode 0600).
    var tempPath =
          files.pathJoin(files.pathDirname(sessionPath), '.meteorsession.' +
                    Math.floor(Math.random() * 999999));
    try {
      var fd = files.open(tempPath, 'wx', 0o600);
    } catch (e) {
      continue;
    }

    try {
      // Write `data` to the file.
      var buf = new Buffer(JSON.stringify(data, undefined, 2), 'utf8');
      files.write(fd, buf, 0, buf.length, 0);
    } finally {
      files.close(fd);
    }

    // Atomically remove the old file (if any) and replace it with
    // the temporary file we just created.
    files.rename(tempPath, sessionPath);
    return;
  }
};

var getSession = function (sessionData, domain) {
  if (typeof (sessionData.sessions) !== "object") {
    sessionData.sessions = {};
  }
  if (typeof (sessionData.sessions[domain]) !== "object") {
    sessionData.sessions[domain] = {};
  }
  return sessionData.sessions[domain];
};

// types:
// - "meteor-account": a login to your Meteor Account
// We previously used:
// - "galaxy": a login to a legacy Galaxy prototype server
var ensureSessionType = function (session, type) {
  if (! _.has(session, 'type')) {
    session.type = type;
  } else if (session.type !== type) {
    // Blow away whatever was there. We lose pendingRevokes but that's
    // OK since this should never happen in normal operation. (It
    // would happen if the Meteor Accounts server mode somewhere else
    // and a Galaxy was deployed at its old address, for example).
    _.each(_.keys(session), function (key) {
      delete session[key];
    });
    session.type = type;
  }
};

var writeMeteorAccountsUsername = function (username) {
  var data = readSessionData();
  var session = getSession(data, config.getAccountsDomain());
  session.username = username;
  writeSessionData(data);
};

// Given an object 'data' in the format returned by readSessionData,
// modify it to make the user logged out.
var logOutAllSessions = function (data) {
  _.each(data.sessions, function (session, domain) {
    logOutSession(session);
  });
};

// As logOutAllSessions, but for a session on a particular domain
// rather than all sessions.
var logOutSession = function (session) {
  var crypto = require('crypto');

  delete session.username;
  delete session.userId;
  delete session.registrationUrl;

  if (_.has(session, 'token')) {
    if (! (session.pendingRevoke instanceof Array)) {
      session.pendingRevoke = [];
    }

    // Delete the auth token itself, but save the tokenId, which is
    // useless for authentication. The next time we're online, we'll
    // send the tokenId to the server to revoke the token on the
    // server side too.
    if (typeof session.tokenId === "string") {
      session.pendingRevoke.push(session.tokenId);
    }
    delete session.token;
    delete session.tokenId;
  }
};

// Given an object 'data' in the format returned by readSessionData,
// return true if logged in, else false.
var loggedIn = function (data) {
  return !! getSession(data, config.getAccountsDomain()).userId;
};

// Given an object 'data' in the format returned by readSessionData,
// return the currently logged in user, or null if not logged in or if
// the logged in user doesn't have a username.
var currentUsername = function (data) {
  var sessionData = getSession(data, config.getAccountsDomain());
  return sessionData.username || null;
};

var removePendingRevoke = function (domain, tokenIds) {
  var data = readSessionData();
  var session = getSession(data, domain);
  session.pendingRevoke = _.difference(session.pendingRevoke, tokenIds);
  if (! session.pendingRevoke.length) {
    delete session.pendingRevoke;
  }
  writeSessionData(data);
};

// If there are any logged out (pendingRevoke) tokens that haven't
// been sent to the server for revocation yet, try to send
// them. Reads the session file and then writes it back out to
// disk. If the server can't be contacted, fail silently (and leave
// the pending invalidations in the session file for next time).
//
// options:
//  - timeout: request timeout in milliseconds
//  - firstTry: cosmetic. set to true if we recently logged out a
//    session. just changes the error message.
//  - connection: an open connection to the accounts server. If not
//    provided, this function will open one itself.
var tryRevokeOldTokens = function (options) {
  options = _.extend({
    timeout: 5000
  }, options || {});

  var warned = false;
  var domainsWithRevokedTokens = [];
  _.each(readSessionData().sessions || {}, function (session, domain) {
    if (session.pendingRevoke &&
        session.pendingRevoke.length) {
      domainsWithRevokedTokens.push(domain);
    }
  });

  var logoutFailWarning = function (domain) {
    if (! warned) {
      // This isn't ideal but is probably better that saying nothing at all
      Console.error("warning: " +
                    (options.firstTry ?
                    "couldn't" : "still trying to") +
                     " confirm logout with " + domain);
      warned = true;
    }
  };

  _.each(domainsWithRevokedTokens, function (domain) {
    var data = readSessionData();
    var session = data.sessions[domain] || {};
    var tokenIds = session.pendingRevoke || [];
    if (! tokenIds.length) {
      return;
    }

    var url;


    if (session.type === "meteor-account") {
      try {
        sessionMethodCaller('revoke', {
          timeout: options.timeout,
          connection: options.connection
        })(tokenIds);
        removePendingRevoke(domain, tokenIds);
      } catch (err) {
        logoutFailWarning(domain);
      }
      return;
    } else if (session.type === "galaxy") {
      // These are tokens from a legacy Galaxy prototype, which cannot be
      // revoked (because the prototype no longer exists), but we can at least
      // remove them from the file.
      removePendingRevoke(domain, tokenIds);
    } else {
      // don't know how to revoke tokens of this type
      logoutFailWarning(domain);
      return;
    }
  });
};

var sendAuthorizeRequest = function (clientId, redirectUri, state) {
  var authCodeUrl = config.getOauthUrl() + "/authorize?" +
        querystring.stringify({
          state: state,
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri
        });

  // It's very important that we don't have request follow the
  // redirect for us, but instead issue the second request ourselves,
  // since request would pass our credentials along to the redirected
  // URL. See comments in http-helpers.js.
  var codeResult = httpHelpers.request({
    url: authCodeUrl,
    method: 'POST',
    strictSSL: true,
    useAuthHeader: true
  });

  var response = codeResult.response;
  if (response.statusCode !== 302 || ! response.headers.location) {
    throw new Error('access-denied');
  }

  if (url.parse(response.headers.location).hostname !==
      url.parse(redirectUri).hostname) {
    // If we didn't get an immediate redirect to the redirectUri then
    // presumably the oauth server is trying to interact with us (make
    // us log in, authorize the client, or something like that). We're
    // not a web browser so we can't participate in such things.
    throw new Error('access-denied');
  }

  return { location: response.headers.location };
};

// Do an OAuth flow with the Meteor developer accounts server to log in
// to an OAuth client. `conn` is expected to be a DDP connection to the
// OAuth client app. Options are:
//  - clientId: OAuth client id parameter
//  - redirectUri: OAuth redirect_uri parameter
//  - domain: the domain for saving the received login token on success
//    in the Meteor session file
//  - sessionType: the value of the 'type' field for the session saved
//    in the Meteor session file on success
// All options are required.
//
// Throws an error if the login is not successful.
var oauthFlow = function (conn, options) {
  var crypto = require('crypto');
  var credentialToken = crypto.randomBytes(16).toString('hex');

  var authorizeResult = sendAuthorizeRequest(
    options.clientId,
    options.redirectUri,
    credentialToken
  );

  // XXX We're using a test-only flag here to just get the raw
  // credential secret (instead of a bunch of code that communicates the
  // credential secret somewhere else); this should be temporary until
  // we give this a nicer name and make it not just test only.
  var redirectResult = httpHelpers.request({
    url: authorizeResult.location + '&only_credential_secret_for_test=1',
    method: 'GET',
    strictSSL: true
  });

  var response = redirectResult.response;
  // 'access-denied' isn't exactly right because it's possible that the server
  // went down since our last request, but close enough.

  if (response.statusCode !== 200) {
    throw new Error('access-denied');
  }

  // XXX tokenId???
  var loginResult = conn.apply('login', [{
    oauth: {
      credentialToken: credentialToken,
      credentialSecret: response.body
    }
  }], { wait: true });

  if (loginResult.token && loginResult.id) {
    var data = readSessionData();
    var session = getSession(data, options.domain);
    ensureSessionType(session, options.sessionType);
    session.token = loginResult.token;
    writeSessionData(data);
    return true;
  } else {
    throw new Error('login-failed');
  }
};

// Prompt the user for a password, and then log in. Returns true if a
// successful login was accomplished, else false.
//
// Options should include either 'email' or 'username', and may also
// include:
// - retry: if true, then if the user gets the password wrong,
//   reprompt.
// - suppressErrorMessage: true if the function should not print an
//   error message to stderr if the login fails
// - connection: an open connection to the accounts server. If not
//   provided, this function will open its own connection.
var doInteractivePasswordLogin = function (options) {
  var loginData = {};

  if (_.has(options, 'username')) {
    loginData.username = options.username;
  } else if (_.has(options, 'email')) {
    loginData.email = options.email;
  } else {
    throw new Error("Need username or email");
  }

  if (_.has(options, 'password')) {
    loginData.password = options.password;
  }

  var loginFailed = function () {
    if (! options.suppressErrorMessage) {
      Console.error("Login failed.");
    }
  };

  var conn = options.connection || openAccountsConnection();

  var maybeCloseConnection = function () {
    if (! options.connection) {
      conn.close();
    }
  };

  while (true) {
    if (! _.has(loginData, 'password')) {
      loginData.password = Console.readLine({
        echo: false,
        prompt: "Password: ",
        stream: process.stderr
      });
    }

    try {
      var result = conn.call('login', {
        session: auth.getSessionId(config.getAccountsDomain()),
        meteorAccountsLoginInfo: loginData,
        clientInfo: utils.getAgentInfo()
      });
    } catch (err) {
    }
    if (result && result.token) {
      break;
    } else {
      loginFailed();
      if (options.retry) {
        Console.error();
        continue;
      } else {
        maybeCloseConnection();
        return false;
      }
    }
  }

  if (result.session) {
    auth.setSessionId(config.getAccountsDomain(), result.session);
  }

  var data = readSessionData();
  logOutAllSessions(data);
  var session = getSession(data, config.getAccountsDomain());
  ensureSessionType(session, "meteor-account");
  session.username = result.username;
  session.userId = result.id;
  session.token = result.token;
  session.tokenId = result.tokenId;
  writeSessionData(data);
  maybeCloseConnection();
  return true;
};

// options are the same as for doInteractivePasswordLogin, except without
// username and email.
exports.doUsernamePasswordLogin = function (options) {
  var username;

  do {
    username = Console.readLine({
      prompt: "Username: ",
      stream: process.stderr
    }).trim();
  } while (username.length === 0);

  return doInteractivePasswordLogin(_.extend({}, options, {
    username: username
  }));
};

exports.doInteractivePasswordLogin = doInteractivePasswordLogin;

exports.loginCommand = withAccountsConnection(function (options,
                                                        connection) {
  config.printUniverseBanner();

  var data = readSessionData();

  if (! getSession(data, config.getAccountsDomain()).token ||
       options.overwriteExistingToken) {
    var loginOptions = {};

    if (options.email) {
      loginOptions.email = Console.readLine({
        prompt: "Email: ",
        stream: process.stderr
      });
    } else {
      loginOptions.username = Console.readLine({
        prompt: "Username: ",
        stream: process.stderr
      });
    }

    loginOptions.connection = connection;

    if (! doInteractivePasswordLogin(loginOptions)) {
      return 1;
    }
  }

  tryRevokeOldTokens({ firstTry: true, connection: connection });

  data = readSessionData();
  Console.error();
  Console.error("Logged in" +
                (currentUsername(data) ? " as " + currentUsername(data) : "") +
                ". Thanks for being a Meteor developer!");
  return 0;
});

exports.logoutCommand = function (options) {
  config.printUniverseBanner();

  var data = readSessionData();
  var wasLoggedIn = !! loggedIn(data);
  logOutAllSessions(data);
  writeSessionData(data);

  tryRevokeOldTokens({ firstTry: true });

  if (wasLoggedIn) {
    Console.error("Logged out.");
  } else {
    // We called logOutAllSessions/writeSessionData anyway, out of an
    // abundance of caution.
    Console.error("Not logged in.");
  }
};

// If this is fully set up account (with a username and password), or
// if not logged in, do nothing. If it is an account without a
// username, contact the server and see if the user finished setting
// it up, and if so grab and save the username. But contact the server
// only once per run of the program. Options:
//  - noLogout: boolean. Set to true if you don't want this function to
//    log out the session if wehave an invalid credential (for example,
//    if a caller wants to do its own error handling for invalid
//    credentials). Defaults to false.
var alreadyPolledForRegistration = false;
exports.pollForRegistrationCompletion = function (options) {
  if (alreadyPolledForRegistration) {
    return;
  }
  alreadyPolledForRegistration = true;

  options = options || {};

  var data = readSessionData();
  var session = getSession(data, config.getAccountsDomain());
  if (session.username || ! session.token) {
    return;
  }

  // We are logged in but we don't yet have a username. Ask the server
  // if a username was chosen since we last checked.
  var username = null;
  var fut = new Future();
  var connection = loggedInAccountsConnection(session.token);

  if (! connection) {
    // Server says our credential isn't any good anymore! Get rid of
    // it. Note that, out of an abundance of caution, this also will
    // enqueue the credential for invalidation (on a future run, we
    // will try to explicitly revoke the credential ourselves).
    if (! options.noLogout) {
      logOutSession(session);
      writeSessionData(data);
    }
    return;
  }

  connection.call('getUsername', function (err, result) {
    if (fut.isResolved()) {
      return;
    }

    if (err) {
      // If anything went wrong, return null just as we would have if
      // we hadn't bothered to ask the server.
      fut['return'](null);
      return;
    }
    fut['return'](result);
  });

  var timer = setTimeout(fiberHelpers.bindEnvironment(function () {
    if (! fut.isResolved()) {
      fut['return'](null);
    }
  }), 5000);

  username = fut.wait();
  connection.close();
  clearTimeout(timer);
  if (username) {
    writeMeteorAccountsUsername(username);
  }
};

exports.registrationUrl = function () {
  var data = readSessionData();
  var url = getSession(data, config.getAccountsDomain()).registrationUrl;
  return url;
};

exports.whoAmICommand = function (options) {
  config.printUniverseBanner();
  auth.pollForRegistrationCompletion();

  var data = readSessionData();
  if (! loggedIn(data)) {
    Console.error(
      "Not logged in. " + Console.command("'meteor login'") + " to log in.");
    return 1;
  }

  var username = currentUsername(data);
  if (username) {
    Console.rawInfo(username + "\n");
    return 0;
  }

  var url = getSession(data, config.getAccountsDomain()).registrationUrl;
  if (url) {
    Console.error("You haven't chosen your username yet. To pick it, go here:");
    Console.error();
    Console.error(Console.url(url));
  } else {
    // Won't happen in normal operation
    Console.error("You haven't chosen your username yet.");
  }

  return 1;
};

// Prompt for an email address. If it doesn't belong to a user, create
// a new deferred registration account and log in as it. If it does,
// try to log the user into it. Returns true on success (user is now
// logged in) or false on failure (user gave up, can't talk to
// network..)
exports.registerOrLogIn = withAccountsConnection(function (connection) {
  var result;
  // Get their email
  while (true) {
    var email = Console.readLine({
      prompt: "Email: ",
      stream: process.stderr
    });

    // Try to register
    try {
      var methodCaller = sessionMethodCaller(
        'tryRegister',
        { connection: connection }
      );
      result = methodCaller(email, utils.getAgentInfo());
      break;
    } catch (err) {
      if (err.error === 400 && ! utils.validEmail(email)) {
        if (email.trim().length) {
          Console.error("Please double-check that address.");
          Console.error();
        }
      } else {
        Console.error("\nCouldn't connect to server. " +
                             "Check your internet connection.");
        return false;
      }
    }
  }

  var loginResult;

  if (! result.alreadyExisted) {
    var data = readSessionData();
    logOutAllSessions(data);
    var session = getSession(data, config.getAccountsDomain());
    ensureSessionType(session, "meteor-account");
    session.token = result.token;
    session.tokenId = result.tokenId;
    session.userId = result.userId;
    session.registrationUrl = result.registrationUrl;
    writeSessionData(data);
    return true;
  } else if (result.alreadyExisted && result.sentRegistrationEmail) {
    Console.error();
    Console.error(
      "You need to pick a password for your account so that you can log in.",
      "An email has been sent to you with the link.");
    Console.error();

    var animationFrame = 0;
    var lastLinePrinted = "";
    var timer = setInterval(function () {
      var spinner = ['-', '\\', '|', '/'];
      lastLinePrinted = "Waiting for you to register on the web... " +
        spinner[animationFrame];
      Console.rawError(lastLinePrinted + Console.CARRIAGE_RETURN);
      animationFrame = (animationFrame + 1) % spinner.length;
    }, 200);
    var stopSpinner = function () {
      Console.rawError(new Array(lastLinePrinted.length + 1).join(' ') +
                       Console.CARRIAGE_RETURN);
      clearInterval(timer);
    };

    try {
      var waitForRegistrationResult = connection.call(
        'waitForRegistration',
        email
      );
    } catch (e) {
      stopSpinner();
      if (e.errorType !== "Meteor.Error") {
        throw e;
      }
      Console.error(
        "When you've picked your password, run " +
        Console.command("'meteor login'") + " to log in.");
      return false;
    }

    stopSpinner();
    Console.error("Username: " + waitForRegistrationResult.username);
    loginResult = doInteractivePasswordLogin({
      username: waitForRegistrationResult.username,
      retry: true,
      connection: connection
    });
    return loginResult;
  } else if (result.alreadyExisted && result.username) {
    Console.error("\nLogging in as " + Console.command(result.username) + ".");

    loginResult = doInteractivePasswordLogin({
      username: result.username,
      retry: true,
      connection: connection
    });
    return loginResult;
  } else {
    // Hmm, got an email we don't understand.
    Console.error(
      "\nThere was a problem. Please log in with " +
      Console.command("'meteor login'") + ".");
    return false;
  }
});

// options: firstTime, leadingNewline
// returns true if it printed something
exports.maybePrintRegistrationLink = function (options) {
  options = options || {};

  auth.pollForRegistrationCompletion();

  var data = readSessionData();
  var session = getSession(data, config.getAccountsDomain());

  if (session.userId && ! session.username && session.registrationUrl) {
    if (options.leadingNewline) {
      Console.error();
    }
    if (options.onlyAllowIfRegistered) {
      // A stronger message: we're going to not allow whatever they were trying
      // to do!
      Console.error(
        "You need to claim a username and set a password on your Meteor",
        "developer account to run this command. It takes about a minute at:",
        session.registrationUrl);
      Console.error();
    } else if (! options.firstTime) {
      // If they've already been prompted to set a password then this
      // is more of a friendly reminder, so we word it slightly
      // differently than the first time they're being shown a
      // registration url.
      Console.error(
        "You should set a password on your Meteor developer account.",
        "It takes about a minute at:", session.registrationUrl);
      Console.error();
    } else {
      Console.error(
        "You can set a password on your account or change your email",
        "address at:", session.registrationUrl);
      Console.error();
    }
    return true;
  }
  return false;
};

exports.tryRevokeOldTokens = tryRevokeOldTokens;

exports.getSessionId = function (domain, sessionData) {
  sessionData = sessionData || readSessionData();
  return getSession(sessionData, domain).session;
};

exports.setSessionId = function (domain, sessionId) {
  var data = readSessionData();
  getSession(data, domain).session = sessionId;
  writeSessionData(data);
};

exports.getSessionToken = function (domain) {
  return getSession(readSessionData(), domain).token;
};

exports.isLoggedIn = function () {
  return loggedIn(readSessionData());
};

// Return the username of the currently logged in user, or false if
// not logged in, or null if the logged in user doesn't have a
// username.
exports.loggedInUsername = function () {
  var data = readSessionData();
  return loggedIn(data) ? currentUsername(data) : false;
};

exports.getAccountsConfiguration = function (conn) {
  // Subscribe to the package server's service configurations so that we
  // can get the OAuth client ID to kick off the OAuth flow.
  var accountsConfiguration = null;

  // We avoid the overhead of creating a 'ddp-and-mongo' isopacket (or
  // always loading mongo whenever we load ddp) by just using the low-level
  // DDP client API here.
  conn.connection.registerStore('meteor_accounts_loginServiceConfiguration', {
    update: function (msg) {
      if (msg.msg === 'added' && msg.fields &&
          msg.fields.service === 'meteor-developer') {
        // Note that this doesn't include the _id (which we'd have to parse),
        // but that's OK.
        accountsConfiguration = msg.fields;
      }
    }
  });

  var serviceConfigurationsSub = conn.subscribeAndWait(
    'meteor.loginServiceConfiguration');
  if (! accountsConfiguration || ! accountsConfiguration.clientId) {
    throw new Error('no-accounts-configuration');
  }

  return accountsConfiguration;
};

// Given a ServiceConnection, log in with OAuth using Meteor developer
// accounts. Assumes the user is already logged in to the developer
// accounts server.
exports.loginWithTokenOrOAuth = function (conn, accountsConfiguration,
                                          url, domain, sessionType) {
  var setUpOnReconnect = function () {
    conn.onReconnect = function () {
      conn.apply('login', [{
        resume: auth.getSessionToken(domain)
      }], { wait: true }, function () { });
    };
  };

  var clientId = accountsConfiguration.clientId;
  var loginResult;

  // Try to log in with an existing login token, if we have one.
  var existingToken = auth.getSessionToken(domain);
  if (existingToken) {
    try {
      loginResult = conn.apply('login', [{
        resume: existingToken
      }], { wait: true });
    } catch (err) {
      // If we get a Meteor.Error, then we swallow it and go on to
      // attempt an OAuth flow and get a new token. If it's not a
      // Meteor.Error, then we leave it to the caller to handle.
      if (err.errorType !== "Meteor.Error") {
        throw err;
      }
    }

    if (loginResult && loginResult.token && loginResult.id) {
      // Success!
      setUpOnReconnect();
      return;
    }
  }

  // Either we didn't have an existing token, or it didn't work. Do an
  // OAuth flow to log in.
  var redirectUri = url + '/_oauth/meteor-developer';

  // Duplicate code from packages/oauth/oauth_common.js. In Meteor 0.9.1, we
  // switched to a new URL style for Oauth that no longer has the "?close"
  // parameter at the end. However, we need all of our backend services to be
  // compatible with old Meteor tools which were written before 0.9.1. These old
  // meteor tools only know how to deal with oauth URLs that have the "?close"
  // query parameter, so our services (packages.meteor.com, etc) have to use the
  // old-style URL. This means that all new Meteor tools also need to use the
  // old-style URL to be compatible with the new servers which are backwards-
  // compatible with the old tool.
  if (! accountsConfiguration.loginStyle) {
    redirectUri = redirectUri + "?close";
  }
  loginResult = oauthFlow(conn, {
    clientId: clientId,
    redirectUri: redirectUri,
    domain: domain,
    sessionType: sessionType
  });

  setUpOnReconnect();
};

exports.loggedInAccountsConnection = loggedInAccountsConnection;
exports.withAccountsConnection = withAccountsConnection;
