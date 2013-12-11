var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var utils = require('./utils.js');
var files = require('./files.js');
var config = require('./config.js');
var httpHelpers = require('./http-helpers.js');
var archinfo = require('./archinfo.js');
var querystring = require('querystring');
var url = require('url');

var getSessionFilePath = function () {
  return path.join(process.env.HOME, '.meteorsession');
};

var readSession = function () {
  var sessionPath = getSessionFilePath();
  if (! fs.existsSync(sessionPath))
    return {};
  return JSON.parse(fs.readFileSync(sessionPath, { encoding: 'utf8' }));
};

var writeSession = function (data) {
  var sessionPath = getSessionFilePath();

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
    // and a Galaxy was deployed at its old address, for example.)
    _.each(_.keys(session), function (key) {
      delete session[key];
    });
    session.type = type;
  }
}

// Given an object 'data' in the format returned by readSession,
// modify it to make the user logged out.
var logOutAllSessions = function (data) {
  var crypto = require('crypto');

  _.each(data.sessions, function (session, domain) {
    delete session.username;

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

// Given an object 'data' in the format returned by readSession,
// return the currently logged in user, or null if not logged in.
var currentUsername = function (data) {
  return getSession(data, config.getAccountsDomain()).username || null;
};

// If there are any logged out (pendingRevoke) tokens that haven't
// been sent to the server for revocation yet, try to send
// them. Reads the session file and then writes it back out to
// disk. If the server can't be contacted, fail silently (and leave
// the pending invalidations in the session file for next time.)
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
  _.each(readSession().sessions || {}, function (session, domain) {
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
    var data = readSession();
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
        useSessionCookie: true,
        timeout: options.timeout
      });
    } catch (e) {
      // most likely we don't have a net connection
      return;
    }
    var response = result.response;

    if (response.statusCode === 200) {
      // Server confirms that the tokens have been revoked
      // (Be careful to reread session data in case httpHelpers changed it)
      data = readSession();
      var session = getSession(data, domain);
      session.pendingRevoke = _.difference(session.pendingRevoke, tokenIds);
      if (! session.pendingRevoke.length)
        delete session.pendingRevoke;
      writeSession(data);
    } else {
      logoutFailWarning(domain);
    }
  });
};

// Given a response and body for a login request (either to meteor accounts or
// to a galaxy), checks if the login was successful, and if so returns an object
// with keys:
// - authToken: the value of the cookie named `authCookieName` in the response
// - tokenId: the id of the auth token (from the response body)
// - username: the username of the logged-in user
// Returns null if the login failed.
var getLoginResult = function (response, body, authCookieName) {
  if (response.statusCode !== 200)
    return null;

  var cookies = response.headers["set-cookie"] || [];
  var authCookie;
  for (var i = 0; i < cookies.length; i++) {
    var re = new RegExp("^" + authCookieName + "=(\\w+)");
    var match = cookies[i].match(re);
    if (match) {
      authCookie = match[1];
      break;
    }
  }
  if (! authCookie)
    return null;

  var parsedBody = body ? JSON.parse(body) : {};
  if (! parsedBody.tokenId)
    return null;

  return {
    authToken: authCookie,
    tokenId: parsedBody.tokenId,
    username: parsedBody.username
  };
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
// object with keys `authToken`, `username` and `tokenId` if the login
// was successful. If an error occurred, returns one of:
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

  // It's very important that we don't have request follow the redirect for us,
  // but instead issue the second request ourselves. This is because request
  // does not appear to segregate cookies by origin, so we would end up with our
  // METEOR_AUTH cookie going to the galaxy.
  try {
    var codeResult = httpHelpers.request({
      url: authCodeUrl,
      method: 'POST',
      followRedirect: false,
      strictSSL: true,
      useAuthCookie: true
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
        cookie: 'GALAXY_OAUTH_SESSION=' + session
      }
    });
  } catch (e) {
    return { error: 'no-galaxy' };
  }
  var loginResult = getLoginResult(galaxyResult.response, galaxyResult.body,
                                   'GALAXY_AUTH');
  // 'access-denied' isn't exactly right because it's possible that the galaxy
  // went down since our last request, but close enough.
  return loginResult || { error: 'access-denied' };
};

exports.loginCommand = function (argv, showUsage) {
  if (argv._.length !== 0)
    showUsage();

  config.printUniverseBanner();

  var byEmail = !! argv.email;
  var galaxy = argv.galaxy;

  var data = readSession();
  var loginData = {};
  var meteorAuth;

  if (! galaxy || ! getSession(data, config.getAccountsDomain()).token) {
    if (byEmail) {
      loginData.email = utils.readLine({ prompt: "Email: " });
    } else {
      loginData.username = utils.readLine({ prompt: "Username: " });
    }
    loginData.password = utils.readLine({
      echo: false,
      prompt: "Password: "
    });

    // Gather user-agent information
    var host = utils.getHost();
    if (host)
      loginData.host = host;
    loginData.agent = "Meteor";
    loginData.agentVersion =
      files.in_checkout() ? "checkout" : files.getToolsVersion();
    loginData.arch = archinfo.host();

    var loginUrl = config.getAccountsApiUrl() + "/login";
    var result;
    try {
      result = httpHelpers.request({
        url: loginUrl,
        method: "POST",
        form: loginData,
        useSessionCookie: true
      });
    } catch (e) {
      process.stdout.write("\nCouldn't connect to server. " +
                           "Check your internet connection.\n");
      process.exit(1);
    }

    var loginResult = getLoginResult(result.response, result.body,
                                     'METEOR_AUTH');
    if (! loginResult || ! loginResult.username) {
      process.stdout.write("\nLogin failed.\n");
      process.exit(1);
    }

    meteorAuth = loginResult.authToken;
    var tokenId = loginResult.tokenId;

    data = readSession();
    logOutAllSessions(data);
    var session = getSession(data, config.getAccountsDomain());
    ensureSessionType(session, "meteor-account");
    session.username = loginResult.username;
    session.token = meteorAuth;
    session.tokenId = tokenId;
    writeSession(data);
  }

  if (galaxy) {
    var galaxyLoginResult = logInToGalaxy(galaxy);
    if (galaxyLoginResult.error) {
      // XXX add human readable error messages
      process.stdout.write('\nLogin to ' + galaxy + ' failed: ' +
                           galaxyLoginResult.error + '\n');
      process.exit(1);
    }
    data = readSession(); // be careful to reread data file after RPC
    var session = getSession(data, galaxy);
    ensureSessionType(session, "galaxy");
    session.token = galaxyLoginResult.authToken;
    session.tokenId = galaxyLoginResult.tokenId;
    writeSession(data);
  }

  tryRevokeOldTokens({ firstTry: true });

  process.stdout.write("\nLogged in " + (galaxy ? "to " + galaxy + " " : "") +
                       "as " + currentUsername(data) + ".\n" +
                       "Thanks for being a Meteor developer!\n");
};

exports.logoutCommand = function (argv, showUsage) {
  if (argv._.length !== 0)
    showUsage();

  config.printUniverseBanner();

  var data = readSession();
  var wasLoggedIn = !! currentUsername(data);
  logOutAllSessions(data);
  writeSession(data);

  tryRevokeOldTokens({ firstTry: true });

  if (wasLoggedIn)
    process.stderr.write("Logged out.\n");
  else
    // We called logOutAllSessions/writeSession anyway, out of an
    // abundance of caution.
    process.stderr.write("Not logged in.\n");
};

exports.whoAmICommand = function (argv, showUsage) {
  if (argv._.length !== 0)
    showUsage();

  config.printUniverseBanner();

  var data = readSession();
  var username = currentUsername(data);
  if (username) {
    process.stdout.write(username + "\n");
    process.exit(0);
  } else {
    process.stderr.write("Not logged in. 'meteor login' to log in.\n");
    process.exit(1);
  }
};

exports.tryRevokeOldTokens = tryRevokeOldTokens;

exports.getSessionId = function (domain) {
  return getSession(readSession(), domain).session;
};

exports.setSessionId = function (domain, sessionId) {
  var data = readSession();
  getSession(data, domain).session = sessionId;
  writeSession(data);
};

exports.getSessionToken = function (domain) {
  return getSession(readSession(), domain).token;
};

exports.isLoggedIn = function () {
  // XXX will need to change with deferred registration!
  return !! currentUsername(readSession());
};

// Return the username of the currently logged in user, or false if
// not logged in, or null if the logged in user doesn't have a
// username.
exports.loggedInUsername = function () {
  // XXX will need to change with deferred registration!
  return currentUsername(readSession) || false;
};
