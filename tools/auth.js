var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var utils = require('./utils.js');
var files = require('./files.js');
var config = require('./config.js');
var httpHelpers = require('./http-helpers.js');
var archinfo = require('./archinfo.js');
var config = require('./config.js');
var querystring = require('querystring');
var url = require('url');

var auth = exports;

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
}

// Given an object 'data' in the format returned by readSessionData,
// modify it to make the user logged out.
var logOutAllSessions = function (data) {
  var crypto = require('crypto');

  _.each(data.sessions, function (session, domain) {
    delete session.username;
    delete session.userId;

    if (_.has(session, 'token')) {
      if (! (session.pendingRevoke instanceof Array))
        session.pendingRevoke = [];

      // Delete the auth token itself, but save the tokenId, which
      // is useless for authentication. The next time we're online,
      // we'll send the tokenId to the server to revoke the token on
      // the server side too.
      if (typeof session.tokenId === "string")
        session.pendingRevoke.push(session.tokenId);
      delete session.token;
      delete session.tokenId;
    }
  });
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
  return getSession(data, config.getAccountsDomain()).username || null;
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
      url = config.getAccountsApiUrl() + "/revoke";
    } else if (session.type === "galaxy") {
      var oauthInfo = fetchGalaxyOAuthInfo(domain, options.timeout);
      if (oauthInfo) {
        url = oauthInfo.revokeUri;
      } else {
        logoutFailWarning(domain);
        return;
      }
    } else {
      // don't know how to revoke tokens of this type
      logoutFailWarning(domain);
      return;
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
      return;
    }
    var response = result.response;

    if (response.statusCode === 200 &&
        response.body) {
      try {
        var body = JSON.parse(response.body);
        if (body.tokenRevoked) {
          // Server confirms that the tokens have been revoked. Checking for a
          // `tokenRevoked` key in the response confirms that we hit an actual
          // accounts server that understands that we were trying to revoke some
          // tokens, not just a random URL that happened to return a 200
          // response.

          // (Be careful to reread session data in case httpHelpers changed it)
          data = readSessionData();
          var session = getSession(data, domain);
          session.pendingRevoke = _.difference(session.pendingRevoke, tokenIds);
          if (! session.pendingRevoke.length)
            delete session.pendingRevoke;
          writeSessionData(data);
        }
      } catch (e) {
        logoutFailWarning(domain);
      }
    } else {
      logoutFailWarning(domain);
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
var doInteractivePasswordLogin = function (options) {
  var loginData = utils.getAgentInfo();

  if (_.has(options, 'username'))
    loginData.username = options.username;
  else if (_.has(options, 'email'))
    loginData.email = options.email;
  else
    throw new Error("Need username or email");

  while (true) {
    loginData.password = utils.readLine({
      echo: false,
      prompt: "Password: "
    });

    var result;
    try {
      result = httpHelpers.request({
        url: config.getAccountsApiUrl() + "/login",
        method: "POST",
        form: loginData,
        useSessionHeader: true
      });
      var body = JSON.parse(result.body);
    } catch (e) {
      process.stderr.write("\nCouldn't connect to server. " +
                           "Check your internet connection.\n");
      return false;
    }

    if (result.response.statusCode === 200 &&
        _.has(result.response.headers, 'x-meteor-auth'))
      break;

    process.stderr.write("Login failed.\n");
    if (options.retry) {
      process.stderr.write("\n");
      continue;
    }
    else
      return false;
  }

  var data = readSessionData();
  logOutAllSessions(data);
  var session = getSession(data, config.getAccountsDomain());
  ensureSessionType(session, "meteor-account");
  session.username = body.username;
  session.userId = body.userId;
  session.token = result.response.headers['x-meteor-auth'];
  session.tokenId = body.tokenId;
  writeSessionData(data);
  return true;
};

exports.loginCommand = function (options) {
  config.printUniverseBanner();

  var data = readSessionData();
  var galaxy = options.galaxy;

  if (! galaxy || ! getSession(data, config.getAccountsDomain()).token) {
    var loginOptions = {};

    if (options.email) {
      loginOptions.email = utils.readLine({ prompt: "Email: " });
    } else {
      loginOptions.username = utils.readLine({ prompt: "Username: " });
    }

    if (! doInteractivePasswordLogin(loginOptions))
      return 1;
  }

  if (galaxy) {
    var galaxyLoginResult = logInToGalaxy(galaxy);
    if (galaxyLoginResult.error) {
      // XXX add human readable error messages
      process.stdout.write('\nLogin to ' + galaxy + ' failed. ');

      if (galaxyLoginResult.error === 'unauthorized') {
        process.stdout.write('You are not authorized for this galaxy.\n');
      } else if (galaxyLoginResult.error === 'no_oauth_server') {
        process.stdout.write('The galaxy could not ' +
                             'contact Meteor Accounts.\n');
      } else if (galaxyLoginResult.error === 'no_identity') {
        process.stdout.write('Your login information could not be found.\n');
      } else {
        process.stdout.write('Error: ' + galaxyLoginResult.error + '\n');
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

  tryRevokeOldTokens({ firstTry: true });

  data = readSessionData();
  process.stdout.write("\nLogged in" + (galaxy ? " to " + galaxy : "") +
                       (currentUsername(data) ?
                        " as " + currentUsername(data) : "") + ".\n" +
                       "Thanks for being a Meteor developer!\n");
  return 0;
};

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

exports.whoAmICommand = function (options) {
  config.printUniverseBanner();

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
    process.stderr.write("You haven't chosen your username yet.\n")
  }

  return 1;
};

// Prompt for an email address. If it doesn't belong to a user, create
// a new deferred registration account and log in as it. If it does,
// try to log the user into it. Returns true on success (user is now
// logged in) or false on failure (user gave up, can't talk to
// network..)
exports.registerOrLogIn = function () {
  // Get their email
  while (true) {
    var email = utils.readLine({ prompt: "Email: " });
    if (utils.validEmail(email))
      break;
    if (email.trim().length)
      process.stderr.write("Please double-check that address.\n\n");
  }

  // Try to register
  var result;
  try {
    result = httpHelpers.request({
      url: config.getAccountsApiUrl() + "/register",
      method: "POST",
      form: _.extend(utils.getAgentInfo(), {
        email: email
      }),
      useSessionHeader: true
    });
    var body = JSON.parse(result.body);
  } catch (e) {
    process.stderr.write("\nCouldn't connect to server. " +
                         "Check your internet connection.\n");
    return false;
  }

  if (result.response.statusCode === 200) {
    if (! _.has(result.response.headers, 'x-meteor-auth')) {
      process.stdout.write("\nSorry, the server is having a problem.\n" +
                          "Please try again later.\n");
      return false;
    }

    var data = readSessionData();
    logOutAllSessions(data);
    var session = getSession(data, config.getAccountsDomain());
    ensureSessionType(session, "meteor-account");
    session.token = result.response.headers['x-meteor-auth'];
    session.tokenId = body.tokenId;
    session.userId = body.userId;
    session.registrationUrl = body.registrationUrl;
    writeSessionData(data);
    return true;
  }

  if (body.error === "already_registered" &&
      body.sentRegistrationEmail) {
    process.stderr.write(
"\n" +
"That email address is already in use. We need to confirm that it belongs\n" +
"to you. Luckily this will only take a moment.\n" +
"\n" +
"Check your mail! We've sent you a link. Click it, pick a password,\n" +
"and then come back here to deploy your app.\n");

    var unipackage = require('./unipackage.js');
    var Package = unipackage.load({
      library: release.current.library,
      packages: [ 'meteor', 'livedata' ],
      release: release.current.name
    })
    var DDP = Package.livedata.DDP;
    var authService = DDP.connect(config.getAuthDDPUrl());
    try {
      var result = authService.call("waitForRegistration", email);
    } catch (e) {
      if (! (e instanceof Package.meteor.Meteor.Error))
        throw e;
      process.stderr.write(
"\nWhen you've picked your password, run 'meteor login' and then you'll\n" +
"be good to go.\n");
      return false;
    }

    process.stderr.write("\nGreat! Nice to meet you, " + result.username +
                         "! Now log in with your new password.\n");
    return doInteractivePasswordLogin({
      username: result.username,
      retry: true
    });
  }

  if (body.error === "already_registered" && body.username) {
    process.stderr.write("\nLogging in as " + body.username + ".\n");

    return doInteractivePasswordLogin({
      username: body.username,
      retry: true
    });
  }

  // Hmm, got an email we don't understand.
  process.stderr.write(
"\nThere was a problem. Please log in with 'meteor login'.\n");
  return false;
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
