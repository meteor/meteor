var _ = require('underscore');
var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var utils = require('../utils.js');
var Sandbox = selftest.Sandbox;
var httpHelpers = require('../http-helpers.js');
var config = require('../config.js');

var expectInvalidToken = function (token) {
  // Same XXX as testUtils.registerWithToken: should be hardcoded to
  // https://www.meteor.com?
  var accountsConn = testUtils.ddpConnect(config.getAuthDDPUrl());
  var registrationTokenInfo = accountsConn.call('registrationTokenInfo',
                                                token);
  // We should not be able to get a registration code for an invalid
  // token.
  if (registrationTokenInfo.valid || registrationTokenInfo.code) {
    throw new Error('Expected invalid token is valid!');
  }
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
  var email = testUtils.randomUserEmail();
  var username = testUtils.randomString(10);
  var appName = testUtils.randomAppName();

  var apiToken = testUtils.deployWithNewEmail(s, email, appName);

  // Check that we got a registration email in our inbox.
  var registrationEmail = waitForEmail(email, /Set a password/,
                                       /set a password/, 60);

  // Fish out the registration token and use to it to complete
  // registration.
  var token = testUtils.registrationUrlRegexp.exec(registrationEmail.bodyPage);
  if (! token || ! token[1]) {
    throw new Error("No registration token in email");
  }
  token = token[1];

  testUtils.registerWithToken(token, username, 'testtest', email);

  // Success! 'meteor whoami' should now know who we are.
  var run = s.run('whoami');
  run.waitSecs(testUtils.accountsCommandTimeoutSecs);
  run.read(username + '\n');
  run.expectExit(0);

  // We should be able to log out and log back in with our new password.
  testUtils.logout(s);
  testUtils.login(s, username, 'testtest');

  // And after logging out and logging back in, we should have
  // authorization to delete our app.
  testUtils.cleanUpApp(s, appName);

  // All the tokens we got should now be invalid.
  expectInvalidToken(token);
  expectInvalidToken(apiToken);

  testUtils.logout(s);

  // XXX Test that registration URLs get printed when they should
});

selftest.define('deferred registration revocation', ['net'], function () {
  // Test that if we are logged in as a passwordless user, and our
  // credential gets revoked, and we do something like 'meteor whoami'
  // that polls to see if registration is complete, then we handle it
  // gracefully.

  var s = new Sandbox;
  s.createApp('deployapp', 'empty');
  s.cd('deployapp');

  // Create a new deferred registration account. (Don't bother to wait
  // for the deploy to go through.)
  var email = testUtils.randomUserEmail();
  var username = testUtils.randomString(10);
  var appName = testUtils.randomAppName();
  var run = s.run('deploy', appName);
  run.waitSecs(5);
  run.matchErr('Email:');
  run.write(email + '\n');
  run.waitSecs(90);
  run.match('Deploying');
  run.waitSecs(15); // because the bundler doesn't yield
  run.stop();

  // 'whoami' says that we don't have a password
  run = s.run('whoami');
  run.waitSecs(15);
  run.matchErr('/setPassword?');
  run.expectExit(1);

  // Revoke the credential without updating .meteorsession.
  var sessionState = s.readSessionFile();
  run = s.run('logout');
  run.waitSecs(15);
  run.readErr("Logged out.\n");
  run.expectEnd();
  run.expectExit(0);
  s.writeSessionFile(sessionState);

  // 'whoami' now says that we're not logged in. No errors are printed.
  run = s.run('whoami');
  run.waitSecs(15);
  run.readErr("Not logged in. 'meteor login' to log in.\n");
  run.expectEnd();
  run.expectExit(1);
});

selftest.define(
  'deferred registration - api registration token',
  ['net', 'slow'],
  function () {
    var s = new Sandbox;

    var email = testUtils.randomUserEmail();
    var username = testUtils.randomString(10);
    var appName = testUtils.randomAppName();
    var token = testUtils.deployWithNewEmail(s, email, appName);
    testUtils.registerWithToken(token, username, 'testtest', email);

    testUtils.logout(s);
    testUtils.login(s, username, 'testtest');
    testUtils.cleanUpApp(s, appName);

    // All tokens we received should not be invalid.
    expectInvalidToken(token);
    var registrationEmail = waitForEmail(email, /Set a password/,
                                         /set a password/, 60);
    var emailToken = testUtils.registrationUrlRegexp.exec(
      registrationEmail.bodyPage
    );
    if (! emailToken || ! emailToken[1]) {
      throw new Error('No registration token in email');
    }
    expectInvalidToken(emailToken[1]);

    testUtils.logout(s);
  }
);

selftest.define(
  'deferred registration - register after logging out',
  ['net', 'slow'],
  function () {
    var s = new Sandbox;
    var email = testUtils.randomUserEmail();
    var username = testUtils.randomString(10);
    var appName = testUtils.randomAppName();
    var token = testUtils.deployWithNewEmail(s, email, appName);
    testUtils.logout(s);

    // If we deploy again with the same email address after logging out,
    // we should get a message telling us to check our email and
    // register, and the tool should obediently wait for us to do that
    // before doing the deploy.
    s.createApp('deployapp2', 'empty');
    s.cd('deployapp2');
    var run = s.run('deploy', appName);
    run.waitSecs(testUtils.accountsCommandTimeoutSecs);
    run.matchErr('Email:');
    run.write(email + '\n');
    run.waitSecs(testUtils.accountsCommandTimeoutSecs);
    run.matchErr('pick a password');
    run.matchErr('Waiting for you to register on the web...');

    var registrationEmail = waitForEmail(
      email,
      /Set a password/,
      /You previously created a Meteor developer account/,
      60
    );
    token = testUtils.registrationUrlRegexp.exec(
      registrationEmail.bodyPage
    );
    if (! token || ! token[1]) {
      throw new Error('No registration token in email');
    }

    testUtils.registerWithToken(token[1], username, 'testtest', email);
    run.waitSecs(testUtils.accountsCommandTimeoutSecs);
    run.matchErr('Username: ' + username + '\n');
    run.matchErr('Password: ');
    run.write('testtest\n');
    run.waitSecs(90);
    run.match('Now serving at');
    run.expectExit(0);

    run = s.run('whoami');
    run.read(username);
    run.expectExit(0);

    testUtils.cleanUpApp(s, appName);
    testUtils.logout(s);
  }
);
