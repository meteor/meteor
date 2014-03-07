var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var utils = require('./utils.js');
var files = require('./files.js');
var config = require('./config.js');
var httpHelpers = require('./http-helpers.js');
var archinfo = require('./archinfo.js');
var fiberHelpers = require('./fiber-helpers.js');
var release = require('./release.js');
var querystring = require('querystring');
var url = require('url');
var Future = require('fibers/future');

var auth = exports;

var getLoadedPackages = _.once(function () {
  var unipackage = require('./unipackage.js');
  return unipackage.load({
    library: release.current.library,
    packages: [ 'meteor', 'livedata' ],
    release: release.current.name
  });
});

// Opens and returns a DDP connection to the accounts server. Remember
// to close it when you're done with it!
var openAccountsConnection = function () {
  var DDP = getLoadedPackages().livedata.DDP;
  return DDP.connect(config.getAuthDDPUrl(), {
    headers: { 'User-Agent': httpHelpers.getUserAgent() }
  });
};

// Returns a function that runs `f`, appending an additional argument
// that is a connection to the accounts server, which gets closed when
// `f` returns or throws.
var withAccountsConnection = function (f) {
  return function (/* arguments */) {
    var self = this;
    var args = _.toArray(arguments);
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
  var connection = getLoadedPackages().livedata.DDP.connect(
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
  return function (/* arguments */) {
    var args = _.toArray(arguments);
    args.push({
      session: auth.getSessionId(config.getAccountsDomain()) || null
    });
    var fut = new Future();
    var conn = options.connection || openAccountsConnection();
    conn.apply(methodName, args, fiberHelpers.firstTimeResolver(fut));
    if (options.timeout !== undefined) {
      var timer = setTimeout(fiberHelpers.inFiber(function () {
        if (!fut.isResolved())
          fut.throw(new Error('Method call timed out'));
      }), options.timeout);
    }
    try {
      var result = fut.wait();
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      if (! options.connection)
        conn.close();
    }
    if (result && result.session) {
      auth.setSessionId(config.getAccountsDomain(), result.session);
    }
    return result && result.result;
  };
};

var readSessionData = function () {
  var sessionPath = config.getSessionFilePath();
  if (! fs.existsSync(sessionPath))
    return {};
  return JSON.parse(fs.readFileSync(sessionPath, { encoding: 'utf8' }));
};

var writeSessionData = function (data) {
  var sessionPath = config.getSessionFilePath();

  var tries = 0;
  while (true) {
    if (tries++ > 10)
      throw new Error("can't find a unique name for temporary file?");

    // Create a temporary file in the same directory where we
    // ultimately want to write the session file. Use the exclusive
    // flag to atomically ensure that the file doesn't exist, create
    // it, and make it readable and writable only by the current
    // user (mode 0600).
    var tempPath =
          path.join(path.dirname(sessionPath), '.meteorsession.' +
                    Math.floor(Math.random() * 999999));
    try {
      var fd = fs.openSync(tempPath, 'wx', 0600);
    } catch (e) {
      continue;
    }

    // Write `data` to the file.
    var buf = new Buffer(JSON.stringify(data, undefined, 2), 'utf8');
    fs.writeSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);

    // Atomically remove the old file (if any) and replace it with
    // the temporary file we just created.
    fs.renameSync(tempPath, sessionPath);
    return;
  }
};

var getSession = function (sessionData, domain) {
  if (typeof (sessionData.sessions) !== "object")
    sessionData.sessions = {};
  if (typeof (sessionData.sessions[domain]) !== "object")
    sessionData.sessions[domain] = {};
  return sessionData.sessions[domain];
};

// types:
// - "meteor-account": a login to your Meteor Account
// - "galaxy": a login to a Galaxy
var ensureSessionType = function (session, type) {
  if (! _.has(session, 'type'))
    session.type = type;
  else if (session.type !== type) {
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
    if (! (session.pendingRevoke instanceof Array))
      session.pendingRevoke = [];

    // Delete the auth token itself, but save the tokenId, which is
    // useless for authentication. The next time we're online, we'll
    // send the tokenId to the server to revoke the token on the
    // server side too.
    if (typeof session.tokenId === "string")
      session.pendingRevoke.push(session.tokenId);
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
  if (! session.pendingRevoke.length)
    delete session.pendingRevoke;
  writeSessionData(data);
};

var tryRevokeGalaxyTokens = function (domain, tokenIds, options) {
  var oauthInfo = fetchGalaxyOAuthInfo(domain, options.timeout);
  if (oauthInfo) {
    url = oauthInfo.revokeUri;
  } else {
    return false;
  }

  try {
    var result = httpHelpers.request({
      url: url,
      method: "POST",
      form: {
        tokenId: tokenIds.join(',')
      },
      useSessionHeader: true,
      timeout: options.timeout
    });
  } catch (e) {
    // most likely we don't have a net connection
    return false;
  }
  var response = result.response;

  if (response.statusCode === 200 &&
      response.body) {
    try {
      var body = JSON.parse(response.body);
      if (body.tokenRevoked) {
        // Server confirms that the tokens have been revoked. Checking for a
        // `tokenRevoked` key in the response confirms that we hit an actual
        // galaxy auth server that understands that we were trying to revoke some
        // tokens, not just a random URL that happened to return a 200
        // response.

        // (Be careful to reread session data in case httpHelpers changed it)
        removePendingRevoke(domain, tokenIds);
      }
    } catch (e) {
      return false;
    }
    return true;
  } else {
    return false;
  }
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
        session.pendingRevoke.length)
      domainsWithRevokedTokens.push(domain);
  });

  var logoutFailWarning = function (domain) {
    if (! warned) {
      // This isn't ideal but is probably better that saying nothing at all
      process.stderr.write("warning: " +
                           (options.firstTry ?
                            "couldn't" : "still trying to") +
                           " confirm logout with " + domain +
                           "\n");
      warned = true;
    }
  };

  _.each(domainsWithRevokedTokens, function (domain) {
    var data = readSessionData();
    var session = data.sessions[domain] || {};
    var tokenIds = session.pendingRevoke || [];
    if (! tokenIds.length)
      return;

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
      if (! tryRevokeGalaxyTokens(domain, tokenIds, options)) {
        logoutFailWarning(domain);
      }
    } else {
      // don't know how to revoke tokens of this type
      logoutFailWarning(domain);
      return;
    }
  });
};

// Sends a request to https://<galaxyName>:<DISCOVERY_PORT> to find out the
// galaxy's OAuth client id and redirect_uri that should be used for
// authorization codes for this galaxy. Returns an object with keys
// 'oauthClientId', 'redirectUri', and 'revokeUri', or null if the
// request failed.
//
// 'timeout' is an optional request timeout in milliseconds.
var fetchGalaxyOAuthInfo = function (galaxyName, timeout) {
  var galaxyAuthUrl = 'https://' + galaxyName + ':' +
    config.getDiscoveryPort() + '/_GALAXYAUTH_';
  try {
    var result = httpHelpers.request({
      url: galaxyAuthUrl,
      json: true,
      // on by default in our version of request, but just in case
      strictSSL: true,
      followRedirect: false,
      timeout: timeout || 5000
    });
  } catch (e) {
    return null;
  }

  if (result.response.statusCode === 200 &&
      result.body &&
      result.body.oauthClientId &&
      result.body.redirectUri &&
      result.body.revokeUri) {
    return result.body;
  } else {
    return null;
  }
};

// Uses meteor accounts to log in to the specified galaxy. Returns an
// object with keys `token` and `tokenId` if the login was
// successful. If an error occurred, returns one of:
//   { error: 'access-denied' }
//   { error: 'no-galaxy' }
//   { error: 'no-account-server' }
var logInToGalaxy = function (galaxyName) {
  var oauthInfo = fetchGalaxyOAuthInfo(galaxyName);
  if (! oauthInfo) {
    return { error: 'no-galaxy' };
  }

  var galaxyClientId = oauthInfo.oauthClientId;
  var galaxyRedirect = oauthInfo.redirectUri;

  // Ask the accounts server for an authorization code.
  var crypto = require('crypto');
  var session = crypto.randomBytes(16).toString('hex');
  var stateInfo = { session: session };

  var authCodeUrl = config.getOauthUrl() + "/authorize?" +
        querystring.stringify({
          state: encodeURIComponent(JSON.stringify(stateInfo)),
          response_type: "code",
          client_id: galaxyClientId,
          redirect_uri: galaxyRedirect
        });

  // It's very important that we don't have request follow the
  // redirect for us, but instead issue the second request ourselves,
  // since request would pass our credentials along to the redirected
  // URL. See comments in http-helpers.js.
  try {
    var codeResult = httpHelpers.request({
      url: authCodeUrl,
      method: 'POST',
      strictSSL: true,
      useAuthHeader: true
    });
  } catch (e) {
    return { error: 'no-account-server' };
  }
  var response = codeResult.response;
  if (response.statusCode !== 302 || ! response.headers.location) {
    return { error: 'access-denied' };
  }

  if (url.parse(response.headers.location).hostname !== galaxyName) {
    // If we didn't get an immediate redirect to the redirectUri
    // (which had better be in DNS namespace that belongs to the
    // Galaxy) then presumably the oauth server is trying to interact
    // with us (make us log in, authorize the client, or something
    // like that). We're not a web browser so we can't participate in
    // such things.
    return { error: 'access-denied' };
  }

  // Ask the galaxy to log us in with our auth code.
  try {
    var galaxyResult = httpHelpers.request({
      url: response.headers.location,
      method: 'GET',
      strictSSL: true,
      headers: {
        cookie: 'GALAXY_OAUTH_SESSION=' + session +
          '; GALAXY_USER_AGENT_TOOL=' +
          encodeURIComponent(JSON.stringify(utils.getAgentInfo()))
      }
    });
    var body = JSON.parse(galaxyResult.body);
  } catch (e) {
    return { error: (body && body.error) || 'no-galaxy' };
  }
  response = galaxyResult.response;

  // 'access-denied' isn't exactly right because it's possible that the galaxy
  // went down since our last request, but close enough.

  if (response.statusCode !== 200 ||
      ! body ||
      ! _.has(galaxyResult.setCookie, 'GALAXY_AUTH'))
    return { error: (body && body.error) || 'access-denied' };

  return {
    token: galaxyResult.setCookie.GALAXY_AUTH,
    tokenId: body.tokenId
  };
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

  if (_.has(options, 'username'))
    loginData.username = options.username;
  else if (_.has(options, 'email'))
    loginData.email = options.email;
  else
    throw new Error("Need username or email");

  var loginFailed = function () {
    if (! options.suppressErrorMessage) {
      process.stderr.write("Login failed.\n");
    }
  };

  var conn = options.connection || openAccountsConnection();

  var maybeCloseConnection = function () {
    if (! options.connection)
      conn.close();
  };

  while (true) {
    loginData.password = utils.readLine({
      echo: false,
      prompt: "Password: ",
      stream: process.stderr
    });

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
        process.stderr.write("\n");
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
    username = utils.readLine({
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
  var galaxy = options.galaxy;

  if (! galaxy &&
      (! getSession(data, config.getAccountsDomain()).token ||
       options.overwriteExistingToken)) {
    var loginOptions = {};

    if (options.email) {
      loginOptions.email = utils.readLine({
        prompt: "Email: ",
        stream: process.stderr
      });
    } else {
      loginOptions.username = utils.readLine({
        prompt: "Username: ",
        stream: process.stderr
      });
    }

    loginOptions.connection = connection;

    if (! doInteractivePasswordLogin(loginOptions)) {
      return 1;
    }
  }

  // XXX Make the galaxy login not do a login if there is an existing token, just like MA
  if (galaxy) {
    var galaxyLoginResult = logInToGalaxy(galaxy);
    if (galaxyLoginResult.error) {
      // XXX add human readable error messages
      process.stderr.write('\nLogin to ' + galaxy + ' failed. ');

      if (galaxyLoginResult.error === 'unauthorized') {
        process.stderr.write('You are not authorized for this galaxy.\n');
      } else if (galaxyLoginResult.error === 'no_oauth_server') {
        process.stderr.write('The galaxy could not ' +
                             'contact Meteor Accounts.\n');
      } else if (galaxyLoginResult.error === 'no_identity') {
        process.stderr.write('Your login information could not be found.\n');
      } else {
        process.stderr.write('Error: ' + galaxyLoginResult.error + '\n');
      }

      return 1;
    }
    data = readSessionData(); // be careful to reread data file after RPC
    var session = getSession(data, galaxy);
    ensureSessionType(session, "galaxy");
    session.token = galaxyLoginResult.token;
    session.tokenId = galaxyLoginResult.tokenId;
    writeSessionData(data);
  }

  tryRevokeOldTokens({ firstTry: true, connection: connection });

  data = readSessionData();
  process.stderr.write("\nLogged in" + (galaxy ? " to " + galaxy : "") +
                       (currentUsername(data) ?
                        " as " + currentUsername(data) : "") + ".\n" +
                       "Thanks for being a Meteor developer!\n");
  return 0;
});

exports.logoutCommand = function (options) {
  config.printUniverseBanner();

  var data = readSessionData();
  var wasLoggedIn = !! loggedIn(data);
  logOutAllSessions(data);
  writeSessionData(data);

  tryRevokeOldTokens({ firstTry: true });

  if (wasLoggedIn)
    process.stderr.write("Logged out.\n");
  else
    // We called logOutAllSessions/writeSessionData anyway, out of an
    // abundance of caution.
    process.stderr.write("Not logged in.\n");
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
  if (alreadyPolledForRegistration)
    return;
  alreadyPolledForRegistration = true;

  options = options || {};

  var data = readSessionData();
  var session = getSession(data, config.getAccountsDomain());
  if (session.username || ! session.token)
    return;

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
    if (fut.isResolved())
      return;

    if (err) {
      // If anything went wrong, return null just as we would have if
      // we hadn't bothered to ask the server.
      fut['return'](null);
      return;
    }
    fut['return'](result);
  });

  var timer = setTimeout(fiberHelpers.inFiber(function () {
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
    process.stderr.write("Not logged in. 'meteor login' to log in.\n");
    return 1;
  }

  var username = currentUsername(data);
  if (username) {
    process.stdout.write(username + "\n");
    return 0;
  }

  var url = getSession(data, config.getAccountsDomain()).registrationUrl;
  if (url) {
    process.stderr.write(
"You haven't chosen your username yet. To pick it, go here:\n" +
"\n" +
url + "\n");
  } else {
    // Won't happen in normal operation
    process.stderr.write("You haven't chosen your username yet.\n");
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
    var email = utils.readLine({
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
        if (email.trim().length)
          process.stderr.write("Please double-check that address.\n\n");
      } else {
        process.stderr.write("\nCouldn't connect to server. " +
                             "Check your internet connection.\n");
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
    process.stderr.write(
"\n" +
"You need to pick a password for your account so that you can log in.\n" +
"An email has been sent to you with the link.\n\n");

    var animationFrame = 0;
    var lastLinePrinted = "";
    var timer = setInterval(function () {
      var spinner = ['-', '\\', '|', '/'];
      lastLinePrinted = "Waiting for you to register on the web... " +
        spinner[animationFrame];
      process.stderr.write(lastLinePrinted + "\r");
      animationFrame = (animationFrame + 1) % spinner.length;
    }, 200);
    var stopSpinner = function () {
      process.stderr.write(new Array(lastLinePrinted.length + 1).join(' ') +
                           "\r");
      clearInterval(timer);
    };

    try {
      var waitForRegistrationResult = connection.call(
        'waitForRegistration',
        email
      );
    } catch (e) {
      stopSpinner();
      if (! (e instanceof getLoadedPackages().meteor.Meteor.Error))
        throw e;
      process.stderr.write(
        "When you've picked your password, run 'meteor login' to log in.\n")
      return false;
    }

    stopSpinner();
    process.stderr.write("Username: " +
                         waitForRegistrationResult.username + "\n");
    loginResult = doInteractivePasswordLogin({
      username: waitForRegistrationResult.username,
      retry: true,
      connection: connection
    });
    return loginResult;
  } else if (result.alreadyExisted && result.username) {
    process.stderr.write("\nLogging in as " + result.username + ".\n");

    loginResult = doInteractivePasswordLogin({
      username: result.username,
      retry: true,
      connection: connection
    });
    return loginResult;
  } else {
    // Hmm, got an email we don't understand.
    process.stderr.write(
      "\nThere was a problem. Please log in with 'meteor login'.\n");
    return false;
  }
});

// options: firstTime, leadingNewline
exports.maybePrintRegistrationLink = function (options) {
  options = options || {};

  auth.pollForRegistrationCompletion();

  var data = readSessionData();
  var session = getSession(data, config.getAccountsDomain());

  if (session.userId && ! session.username && session.registrationUrl) {
    if (options.leadingNewline)
      process.stderr.write("\n");
    if (! options.firstTime) {
      // If they've already been prompted to set a password then this
      // is more of a friendly reminder, so we word it slightly
      // differently than the first time they're being shown a
      // registration url.
      process.stderr.write(
"You should set a password on your Meteor developer account. It takes\n" +
"about a minute at: " + session.registrationUrl + "\n\n");
    } else {
      process.stderr.write(
"You can set a password on your account or change your email address at:\n" +
session.registrationUrl + "\n\n");
    }
  }
};

exports.tryRevokeOldTokens = tryRevokeOldTokens;

exports.getSessionId = function (domain) {
  return getSession(readSessionData(), domain).session;
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
