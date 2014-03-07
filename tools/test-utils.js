var _ = require('underscore');
var release = require('./release.js');
var unipackage = require('./unipackage.js');
var config = require('./config.js');

var randomString = function (charsCount) {
  var chars = 'abcdefghijklmnopqrstuvwxyz';
  var str = '';
  for (var i = 0; i < charsCount; i++) {
    str = str + chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return str;
};

exports.accountsCommandTimeoutSecs = 15;

exports.randomString = randomString;

var randomAppName = function () {
  return 'selftest-app-' + randomString(10);
};

exports.randomAppName = randomAppName;

exports.randomUserEmail = function () {
  return 'selftest-user-' + randomString(15) + '@guerrillamail.com';
};

var ensureLegacyReleaseDownloaded = function (sandbox) {
  // Ensure we have 0.7.0.1 downloaded.  This version didn't actually support
  // --get-ready for a built release, but it's an easy way to verify we're
  // actually running an old version.
  var run = sandbox.run('--release', '0.7.0.1', '--get-ready');
  run.waitSecs(75);
  run.matchErr('only works in a checkout\n');
  run.expectExit(1);
};

// Creates an app and deploys it with an old release. 'password' is
// optional. Returns the name of the deployed app.
exports.createAndDeployLegacyApp = function (sandbox, password) {
  var name = randomAppName();
  sandbox.createApp(name, 'empty');
  sandbox.cd(name);

  ensureLegacyReleaseDownloaded(sandbox);

  var runArgs = ['deploy', '--release', '0.7.0.1', name];
  if (password)
    runArgs.push('-P');

  var run = sandbox.run.apply(sandbox, runArgs);

  if (password) {
    run.waitSecs(10);
    run.match('New Password:');
    run.write(password + '\n');
    run.match('New Password (again):');
    run.write(password + '\n');
  }

  run.waitSecs(90);
  run.match('Now serving at ' + name + '.meteor.com');
  // XXX: We should wait for it to exit with code 0, but it times out for some reason.
  run.stop();
  return name;
};

exports.cleanUpLegacyApp = function (sandbox, name, password) {
  ensureLegacyReleaseDownloaded(sandbox);

  var run = sandbox.run('deploy', '--release', '0.7.0.1', '-D', name);
  if (password) {
    run.waitSecs(10);
    run.matchErr('Password:');
    run.write(password + '\n');
  }
  run.waitSecs(20);
  run.match('Deleted');
  // XXX same as above, we should be waiting for exit code 0, but the
  // process appears to never exit.
  run.stop();
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
  var runArgs = ['deploy', name];
  if (options.settingsFile) {
    runArgs.push('--settings');
    runArgs.push(options.settingsFile);
  }
  var run = sandbox.run.apply(sandbox, runArgs);
  run.waitSecs(90);
  run.match('Now serving at ' + name + '.meteor.com');
  run.waitSecs(10);
  run.expectExit(0);
  return name;
};

exports.cleanUpApp = function (sandbox, name) {
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

var registrationUrlRegexp =
      /https:\/\/www\.meteor\.com\/setPassword\?([a-zA-Z0-9\+\/]+)/;
exports.registrationUrlRegexp = registrationUrlRegexp;

// In the sandbox `s`, create and deploy a new app with an unregistered
// email address. Returns the registration token from the printed URL in
// the deploy message.
exports.deployWithNewEmail = function (s, email, appName) {
  s.createApp('deployapp', 'empty');
  s.cd('deployapp');
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
