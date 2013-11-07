var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var utils = require('./utils.js');
var httpHelpers = require('./http-helpers.js');

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

exports.loginCommand = function (argv, showUsage) {
  if (argv._.length !== 0)
    showUsage();

  var byEmail = !! argv.email;

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
  var response = result.response;

  var cookies = response.headers["set-cookie"] || [];
  var meteorAuth;
  for (var i = 0; i < cookies.length; i++) {
    var match = cookies[i].match(/^METEOR_AUTH=(\w+)/);
    if (match) {
      meteorAuth = match[1];
      break;
    }
  }
  var body = result.body ? JSON.parse(result.body) : {};

  if (! meteorAuth || response.statusCode !== 200 || ! body.tokenId) {
    process.stdout.write("Login failed.\n");
    process.exit(1);
  }

  var data = readSession();
  logOutSession(data);
  data.username = body.username;
  if (typeof (data.sessions) !== "object")
    data.sessions = {};
  if (typeof (data.sessions[ACCOUNTS_DOMAIN]) !== "object")
    data.sessions[ACCOUNTS_DOMAIN] = {};
  data.sessions[ACCOUNTS_DOMAIN].token = meteorAuth;
  data.sessions[ACCOUNTS_DOMAIN].tokenId = body.tokenId;
  writeSession(data);

  tryRevokeOldTokens();

  process.stdout.write("\n" + "Logged in as " + body.username + ".\n" +
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
