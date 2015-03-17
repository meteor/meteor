var isopackets = require("./isopackets.js");
var config = require('./config.js');
var utils = require('./utils.js');
var auth = require('./auth.js');
var selftest = require('./selftest.js');

var randomString = function (charsCount) {
  var chars = 'abcdefghijklmnopqrstuvwxyz';
  var str = '';
  for (var i = 0; i < charsCount; i++) {
    str = str + chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return str;
};

exports.accountsCommandTimeoutSecs = 15 * utils.timeoutScaleFactor;

exports.randomString = randomString;

var randomAppName = function () {
  return 'selftest-app-' + randomString(10);
};

exports.randomAppName = randomAppName;

exports.randomUserEmail = function () {
  return 'selftest-user-' + randomString(15) + '@guerrillamail.com';
};

// Creates an app and deploys it. Assumes the sandbox is already logged
// in. Returns the name of the deployed app. Options:
//  - settingsFile: a path to a settings file to deploy with
//  - appName: app name to use; will be generated randomly if not
//    provided
//  - templateApp: the name of the template app to use. defaults to 'empty'
exports.createAndDeployApp = function (sandbox, options) {
  options = options || {};
  var name = options.appName || randomAppName();
  sandbox.createApp(name, options.templateApp || 'empty');
  sandbox.cd(name);

  if (name.indexOf(".") === -1) {
    name = name + "." + config.getDeployHostname();
  }

  var runArgs = ['deploy', name];
  if (options.settingsFile) {
    runArgs.push('--settings');
    runArgs.push(options.settingsFile);
  }
  var run = sandbox.run.apply(sandbox, runArgs);
  run.waitSecs(90);
  run.match('Now serving at http://' + name);
  run.waitSecs(10);
  run.expectExit(0);
  return name;
};

exports.cleanUpApp = function (sandbox, name) {
  if (name.indexOf(".") === -1) {
    name = name + "." + config.getDeployHostname();
  }

  var run = sandbox.run('deploy', '-D', name);
  run.waitSecs(90);
  run.match('Deleted');
  run.expectExit(0);
  return name;
};

exports.login = function (s, username, password) {
  var run = s.run('login');
  run.waitSecs(15);
  run.matchErr('Username:');
  run.write(username + '\n');
  run.matchErr('Password:');
  run.write(password + '\n');
  run.waitSecs(15);
  run.matchErr('Logged in as ' + username + ".");
  run.expectExit(0);
};

exports.logout = function (s) {
  var run = s.run('logout');
  run.waitSecs(15);
  run.matchErr('Logged out');
  run.expectExit(0);
};

exports.getUserId = function (s) {
  var data = JSON.parse(s.readSessionFile());
  return data.sessions[config.getUniverse()].userId;
};

var registrationUrlRegexp =
      /https:\/\/www\.meteor\.com\/setPassword\?([a-zA-Z0-9\+\/]+)/;
exports.registrationUrlRegexp = registrationUrlRegexp;

// In the sandbox `s`, create and deploy a new app with an unregistered
// email address. Returns the registration token from the printed URL in
// the deploy message.
exports.deployWithNewEmail = function (s, email, appName) {
  s.createApp('deployapp', 'empty');
  s.cd('deployapp');

  if (appName.indexOf(".") === -1) {
    appName = appName + "." + config.getDeployHostname();
  }

  var run = s.run('deploy', appName);
  run.waitSecs(exports.accountsCommandTimeoutSecs);
  run.matchErr('Email:');
  run.write(email + '\n');
  run.waitSecs(90);
  // Check that we got a prompt to set a password on meteor.com.
  run.matchErr('set a password');
  var urlMatch = run.matchErr(registrationUrlRegexp);
  if (! urlMatch || ! urlMatch.length || ! urlMatch[1]) {
    throw new Error("Missing registration token");
  }
  var token = urlMatch[1];

  run.expectExit(0);

  return token;
};

var getLoadedPackages = function () {
  return isopackets.load('ddp');
};

var ddpConnect = function (url) {
  var DDP = getLoadedPackages().ddp.DDP;
  return DDP.connect(url);
};

exports.ddpConnect = ddpConnect;

// Given a registration token created by doing a deferred registration
// with `email`, makes a DDP connection to the accounts server and
// finishes the registration process.
exports.registerWithToken = function (token, username, password, email) {
  // XXX It might make more sense to hard-code the DDP url to
  // https://www.meteor.com, since that's who the sandboxes are talking
  // to.
  var accountsConn = ddpConnect(config.getAuthDDPUrl());
  var registrationTokenInfo = accountsConn.call('registrationTokenInfo',
                                                token);
  var registrationCode = registrationTokenInfo.code;
  accountsConn.call('register', {
    username: username,
    password: password,
    emails: [email],
    token: token,
    code: registrationCode
  });
  accountsConn.close();
};

exports.randomOrgName = function () {
  return "selftestorg" + exports.randomString(10);
};

// Logs in as the specified user and creates a randomly named
// organization. Returns the organization name. Calls selftest.fail if
// the organization can't be created.
exports.createOrganization = function (username, password) {
  var orgName = exports.randomOrgName();
  auth.withAccountsConnection(function (conn) {
    try {
      conn.call("login", {
        meteorAccountsLoginInfo: { username: username, password: password },
        clientInfo: {}
      });
    } catch (err) {
      selftest.fail("Failed to log in to Meteor developer accounts\n" +
                    "with test user: " + err);
    }

    try {
      conn.call("createOrganization", orgName);
    } catch (err) {
      selftest.fail("Failed to create organization: " + err);
    }
  })();

  return orgName;
};

exports.getMeteorRuntimeConfigFromHTML = function (html) {
  var m = html.match(/__meteor_runtime_config__ = JSON.parse\(decodeURIComponent\("([^"]+?)"\)\)/);
  if (! m) {
    selftest.fail("Can't find __meteor_runtime_config__");
  }
  return JSON.parse(decodeURIComponent(m[1]));
};
