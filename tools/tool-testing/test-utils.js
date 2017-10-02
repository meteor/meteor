var config = require('../meteor-services/config.js');
var utils = require('../utils/utils.js');
var auth = require('../meteor-services/auth.js');
var selftest = require('./selftest.js');
var httpHelpers = require('../utils/http-helpers.js');
var _ = require('underscore');

import { loadIsopackage } from '../tool-env/isopackets.js'

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

var registrationUrlRegexp =
      /https:\/\/www\.meteor\.com\/setPassword\?([a-zA-Z0-9\+\/]+)/;
exports.registrationUrlRegexp = registrationUrlRegexp;

function ddpConnect(url) {
  return loadIsopackage('ddp-client').DDP.connect(url);
}

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


// Poll the given app looking for the correct settings. Throws an error
// if the settings aren't found after a timeout.
exports.checkForSettings = selftest.markStack(function (appName, settings, timeoutSecs) {
  var timeoutDate = new Date(new Date().valueOf() + timeoutSecs * 1000);
  while (true) {
    if (new Date() >= timeoutDate) {
      selftest.fail('Expected settings not found on app ' + appName);
    }

    var result = httpHelpers.request('http://' + appName);

    // XXX This is brittle; the test will break if we start formatting the
    // __meteor_runtime_config__ JS differently. Ideally we'd do something
    // like point a phantom at the deployed app and actually evaluate
    // Meteor.settings.
    try {
      var mrc = exports.getMeteorRuntimeConfigFromHTML(result.body);
    } catch (e) {
      // ignore
      continue;
    }

    if (_.isEqual(mrc.PUBLIC_SETTINGS, settings['public'])) {
      return;
    }
  }
});
