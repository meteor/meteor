var _ = require('underscore');
var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var utils = require('../utils.js');
var Sandbox = selftest.Sandbox;
var httpHelpers = require('../http-helpers.js');
var release = require('../release.js');
var unipackage = require('../unipackage.js');
var config = require('../config.js');

var getLoadedPackages = _.once(function () {
  return unipackage.load({
    library: release.current.library,
    packages: ['meteor', 'livedata'],
    release: release.current.name
  });
});

var ddpConnect = function (url) {
  var DDP = getLoadedPackages().livedata.DDP;
  return DDP.connect(url);
};

var registrationUrlRegexp =
      /https:\/\/www\.meteor\.com\/setPassword\?([a-zA-Z0-9\+\/]+)/;

// Given a registration token created by doing a deferred registration
// with `email`, makes a DDP connection to the accounts server and
// finishes the registration process.
var registerWithToken = function (token, username, password, email) {
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

// Polls a guerrillamail.com inbox every 3 seconds looking for an email
// that matches the given subject and body regexes. This could fail if
// there is someone else polling this same inbox, so use a random email
// address.
//
// If a matching email is found before the timeout elapses, this
// function returns an object with keys:
//  - subject: the subject line of the matching email
//  - bodyPage: HTML (an entire rendered page) containing the body of
//    the email
// Throws an exception if no matching email is found before the timeout
// elapses.
var waitForEmail = selftest.markStack(function (inbox, subjectRegExp,
                             bodyRegExp, timeoutSecs) {
  if (timeoutSecs) {
    var timeout = setTimeout(function () {
      throw new Error('Waiting for email to ' + inbox +
                      ' timed out.');
    }, timeoutSecs * 1000);
  }

  // Get a session cookie for this inbox.
  var setEmailUrl = 'https://www.guerrillamail.com/ajax.php?f=set_email_user';
  var setEmailData = {
    email_user: inbox.split('@')[0],
    domain: 'guerrillamail.com'
  };
  var setEmailResult = httpHelpers.request({
    method: 'POST',
    url: setEmailUrl,
    form: setEmailData
  });

  var sessionCookie = JSON.parse(setEmailResult.body).sid_token;

  var cookieHeader = "PHPSESSID=" + sessionCookie + ";";

  var match;
  while (! match) {
    var checkInboxUrl = 'https://www.guerrillamail.com/ajax.php?' +
          'f=check_email&seq=1&domain=guerrillamail.com&_=' +
          (+ new Date());
    var checkInboxResult = httpHelpers.request({
      method: 'GET',
      url: checkInboxUrl,
      headers: { Cookie: cookieHeader }
    });

    var body = JSON.parse(checkInboxResult.body);
    _.each(body.list, function (email) {
      var emailId = email.mail_id;
      var subject = email.mail_subject;
      if (subjectRegExp.test(subject)) {
        // Subject matches, so now check the body.
        var bodyResult = httpHelpers.request({
          url: 'https://www.guerrillamail.com/inbox?mail_id=' + emailId,
          headers: { Cookie: cookieHeader }
        });
        if (bodyRegExp.test(bodyResult.body)) {
          match = {
            subject: email.mail_subject,
            bodyPage: bodyResult.body
          };
        }
      }
    });

    if (! match)
      utils.sleepMs(3000);
  }

  clearTimeout(timeout);
  return match;
});

selftest.define('deferred registration - email registration token', ['net', 'slow'], function () {
  var s = new Sandbox;
  s.createApp('deployapp', 'empty');
  s.cd('deployapp');

  // Deploy an app with a new email address.
  var email = testUtils.randomUserEmail();
  var username = testUtils.randomString(10);
  var appName = testUtils.randomAppName();
  var run = s.run('deploy', appName);
  run.waitSecs(testUtils.accountsCommandTimeoutSecs);
  run.matchErr('Email:');
  run.write(email + '\n');
  run.waitSecs(90);
  // Check that we got a prompt to set a password on meteor.com.
  run.matchErr('set a password');
  var urlMatch = run.matchErr(registrationUrlRegexp);
  if (! urlMatch || ! urlMatch[1]) {
    throw new Error("Missing registration URL");
  }
  run.expectExit(0);

  // Check that we got a registration email in our inbox.
  var registrationEmail = waitForEmail(email, /Set a password/,
                                       /set a password/, 60);

  // Fish out the registration token and use to it to complete
  // registration.
  var token = registrationUrlRegexp.exec(registrationEmail.bodyPage);
  if (! token || ! token[1]) {
    throw new Error("No registration token in email");
  }
  token = token[1];

  registerWithToken(token, username, 'testtest', email);

  // Success! We should be able to log out and log back in with our new
  // password.
  testUtils.logout(s);
  testUtils.login(s, username, 'testtest');

  // And after logging out and logging back in, we should have
  // authorization to delete our app.
  testUtils.cleanUpApp(s, appName);

  // XXX Test that registration can only be done once (after using email
  // url, api url fails and vice versa, and after using each of them
  // using it again fails)
  // XXX Test that registration URLs get printed when they should
  // XXX Test registration while the tool is waiting on a DDP method to
  // return (e.g. deploy and login with an existing username that
  // doesn't have a password set yet)
});

selftest.define(
  'deferred registration - api registration token',
  ['net', 'slow'],
  function () {
    var s = new Sandbox;
    s.createApp('deployapp', 'empty');
    s.cd('deployapp');

    // Deploy an app with a new email address.
    var email = testUtils.randomUserEmail();
    var username = testUtils.randomString(10);
    var appName = testUtils.randomAppName();
    var run = s.run('deploy', appName);
    run.waitSecs(testUtils.accountsCommandTimeoutSecs);
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
    registerWithToken(token, username, 'testtest', email);

    testUtils.logout(s);
    testUtils.login(s, username, 'testtest');
    testUtils.cleanUpApp(s, appName);
  }
);
