var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var utils = require('./utils.js');
var httpHelpers = require('./http-helpers.js');
var crypto = require('crypto');

var ACCOUNTS_URL = "http://localhost:3000";
var ACCOUNTS_DOMAIN = "localhost:3000";

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

var setSessionToken = function (sessionData, domain, token, tokenId) {
  if (typeof (sessionData.sessions) !== "object")
    sessionData.sessions = {};
  if (typeof (sessionData.sessions[domain]) !== "object")
    sessionData.sessions[domain] = {};
  sessionData.sessions[domain].token = token;
  sessionData.sessions[domain].tokenId = tokenId;
};

// Given an object 'data' in the format returned by readSession,
// modify it to make the user logged out.
var logOutSession = function (data) {
  var crypto = require('crypto');

  delete data.username;

  _.each(data.sessions, function (info, domain) {
    if (_.has(info, 'token')) {
      if (! (info.pendingRevoke instanceof Array))
        info.pendingRevoke = [];

      // Delete the auth token itself, but save the tokenId, which
      // is useless for authentication. The next time we're online,
      // we'll send the tokenId to the server to revoke the token on
      // the server side too.
      if (typeof info.tokenId === "string")
        info.pendingRevoke.push(info.tokenId);
      delete info.token;
      delete info.tokenId;
    }
  });
};

// If there are any logged out (pendingRevoke) tokens that haven't
// been sent to the server for revocation yet, try to send
// them. Reads the session file and then writes it back out to
// disk. If the server can't be contacted, fail silently (and leave
// the pending invalidations in the session file for next time.)
//
// options:
//  - timeout: request timeout in milliseconds
var tryRevokeOldTokens = function (options) {
  options = _.extend({
    timeout: 5000
  }, options || {});

  // XXX support domains other than ACCOUNTS_DOMAIN

  var data = readSession();
  data.sessions = data.sessions || {};
  var session = data.sessions[ACCOUNTS_DOMAIN];
  if (! session)
    return;
  var tokenIds = session.pendingRevoke || [];
  if (! tokenIds.length)
    return;
  try {
    var result = httpHelpers.request({
      url: ACCOUNTS_URL + "/logoutById",
      method: "POST",
      form: {
        tokenId: tokenIds.join(',')
      },
      timeout: options.timeout
    });
  } catch (e) {
    // most likely we don't have a net connection
    return;
  }
  var response = result.response;

  if (response.statusCode === 200) {
    // Server confirms that the tokens have been revoked
    delete session.pendingRevoke;
    writeSession(data);
  } else {
    // This isn't ideal but is probably better that saying nothing at all
    process.stderr.write("warning: couldn't confirm logout with server\n");
  }
};

// Given a response and body for a login request (either to meteor accounts or
// to a galaxy), checks if the login was successful, and if so returns an object
// with keys:
// - authToken: the value of the cookie named `authCookieName` in the response
// - tokenId: the id of the auth token (from the response body)
// - username: the username of the logged-in user
// Returns undefined if the login failed.
var getLoginResult = function (response, body, authCookieName) {
  if (response.statusCode !== 200)
    return undefined;

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
    return undefined;

  var parsedBody = body ? JSON.parse(body) : {};
  if (! parsedBody.tokenId || ! parsedBody.username)
    return undefined;

  return {
    authToken: authCookie,
    tokenId: parsedBody.tokenId,
    username: parsedBody.username
  };
};

// Uses meteor accounts to log in to the specified galaxy. Must be called with a
// valid cookie for METEOR_AUTH. Returns an object with keys `authToken`,
// `username` and `tokenId` if the login was successful, and undefined
// otherwise.
var logInToGalaxy = function (galaxyName, meteorAuthCookie) {
  // XXX these are for testing. will be replaced by galaxy discovery.
  var galaxyClientId = 'abc';
  var galaxyRedirect = 'http://localhost:9414/auth/token';

  // Ask the accounts server for an authorization code.
  var state = crypto.randomBytes(16).toString('hex');
  var authCodeUrl = ACCOUNTS_URL + "/authorize?state=" + state +
        "&response_type=code&client_id=" + galaxyClientId +
        "&redirect_uri=" + encodeURIComponent(galaxyRedirect);
  // It's very important that we don't have request follow the redirect for us,
  // but instead issue the second request ourselves. This is because request
  // does not appear to segregate cookies by origin, so we would end up with our
  // METEOR_AUTH cookie going to the galaxy.
  var codeResult = httpHelpers.request({
    url: authCodeUrl,
    method: 'POST',
    followRedirect: false,
    headers: {
      cookie: 'METEOR_AUTH=' + meteorAuthCookie
    }
  });
  var response = codeResult.response;
  if (response.statusCode !== 302 || ! response.headers.location) {
    return false;
  }

  var galaxyResult = httpHelpers.request({
    url: response.headers.location,
    method: 'POST'
  });
  return getLoginResult(galaxyResult.response, galaxyResult.body,
                        'GALAXY_AUTH');
};

exports.loginCommand = function (argv, showUsage) {
  if (argv._.length !== 0)
    showUsage();

  var byEmail = !! argv.email;
  var galaxy = argv.galaxy;

  var loginData = {};
  if (byEmail) {
    loginData.email = utils.readLine({ prompt: "Email: " });
  } else {
    loginData.username = utils.readLine({ prompt: "Username: " });
  }
  loginData.password = utils.readLine({
    echo: false,
    prompt: "Password: "
  });
  process.stdout.write("\n");

  var loginUrl = ACCOUNTS_URL + "/login";
  var result;
  try {
    result = httpHelpers.request({
      url: loginUrl,
      method: "POST",
      form: loginData
    });
  } catch (e) {
    process.stdout.write("\nCouldn't connect to server. " +
                         "Check your internet connection.\n");
    process.exit(1);
  }

  var loginResult = getLoginResult(result.response, result.body, 'METEOR_AUTH');
  if (! loginResult) {
    process.stdout.write("Login failed.\n");
    process.exit(1);
  }

  var meteorAuth = loginResult.authToken;
  var tokenId = loginResult.tokenId;

  var data = readSession();
  logOutSession(data);
  data.username = loginResult.username;
  setSessionToken(data, ACCOUNTS_DOMAIN, meteorAuth, tokenId);

  if (galaxy) {
    var galaxyLoginResult = logInToGalaxy(galaxy, meteorAuth);
    if (! galaxyLoginResult) {
      process.stdout.write('Login to ' + galaxy + ' failed.\n');
      process.exit(1);
    }
    setSessionToken(data, galaxy, galaxyLoginResult.authToken,
                    galaxyLoginResult.tokenId);
  }

  writeSession(data);
  tryRevokeOldTokens();

  process.stdout.write("\n");
  process.stdout.write("Logged in " + (galaxy ? "to " + galaxy + " " : "") +
                       "as " + loginResult.username + ".\n" +
                       "Thanks for being a Meteor developer!\n");
};

exports.logoutCommand = function (argv, showUsage) {
  if (argv._.length !== 0)
    showUsage();

  var data = readSession();
  var wasLoggedIn = !! data.username;
  logOutSession(data);
  writeSession(data);

  tryRevokeOldTokens();

  if (wasLoggedIn)
    process.stderr.write("Logged out.\n");
  else
    // We called logOutSession/writeSession anyway, out of an
    // abundance of caution.
    process.stderr.write("Not logged in.\n");
};

exports.whoAmICommand = function (argv, showUsage) {
  if (argv._.length !== 0)
    showUsage();

  var data = readSession();
  if (data.username) {
    process.stdout.write(data.username + "\n");
    process.exit(0);
  } else {
    process.stderr.write("Not logged in. 'meteor login' to log in.\n");
    process.exit(1);
  }
};

exports.tryRevokeOldTokens = tryRevokeOldTokens;
