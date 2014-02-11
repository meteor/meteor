var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

var randomString = function (charsCount) {
  var chars = 'abcdefghijklmnopqrstuvwxyz';
  var str = '';
  for (var i = 0; i < charsCount; i++) {
    str = str + chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return str;
};

// XXX need to make sure that mother doesn't clean up:
// 'legacy-password-app-for-selftest'
// 'legacy-no-password-app-for-selftest'
// 'app-for-selftest-not-test-owned'

selftest.define('deploy - logged in', ['net', 'slow'], function () {
  var s = new Sandbox;

  s.createApp('deployapp', 'empty');
  s.cd('deployapp');

  var run = s.run('login');
  run.waitSecs(2);
  run.matchErr('Username:');
  run.write('test\n');
  run.matchErr('Password:');
  run.write('testtest\n');
  run.waitSecs(5);
  run.matchErr('Logged in as test.');
  run.expectExit(0);

  var appName = randomString(10);

  // Deploy an app.
  run = s.run('deploy', appName);
  run.waitSecs(60);
  run.match('Now serving at ' + appName + '.meteor.com');
  run.expectExit(0);

  // Delete our deployed app.
  run = s.run('deploy', '-D', appName);
  run.waitSecs(20);
  run.match('Deleted');
  run.expectExit(0);

  // When we try to deploy to legacy-password-app-for-selftest, we
  // should get a message telling us to claim it with 'meteor claim'.
  run = s.run('deploy', 'legacy-password-app-for-selftest');
  run.waitSecs(5);
  run.matchErr('meteor claim');
  run.expectExit(1);

  // Deploying to legacy-no-password-app-for-selftest should just work.
  run = s.run('deploy', 'legacy-no-password-app-for-selftest');
  run.waitSecs(60);
  run.match('Now serving at legacy-no-password-app-for-selftest.meteor.com');
  run.expectExit(0);

  // When we try to deploy to an app that is owned by an account that
  // isn't ours, we should get a message telling us that we are not
  // authorized.
  run = s.run('deploy', 'app-for-selftest-not-test-owned');
  run.waitSecs(5);
  run.matchErr('belongs to a different user');
  run.expectExit(1);
});

selftest.define('deploy - logged out', ['net', 'slow'], function () {
  var s = new Sandbox;

  var logout = function () {
    // Log out
    var run = s.run('logout');
    run.waitSecs(5);
    run.matchErr('Logged out');
    run.expectExit(0);
  };

  s.createApp('deployapp', 'empty');
  s.cd('deployapp');

  // Deploy when logged out. We should be prompted to log in and then
  // the deploy should succeed.
  var appName = randomString(10);
  var run = s.run('deploy', appName);
  run.waitSecs(5);
  run.matchErr('Email:');
  // XXX We should be able to log in with username here too?
  run.write('test@test.com\n');
  run.matchErr('Password:');
  run.write('testtest\n');
  run.waitSecs(60);
  run.match('Now serving at ' + appName + '.meteor.com');
  run.expectExit(0);
  // Clean up our deployed app
  run = s.run('deploy', '-D', appName);
  run.waitSecs(20);
  run.match('Deleted');
  run.expectExit(0);

  logout();

  // Deploying to legacy-no-password-app-for-selftest should prompt us
  // to login, and then just work.
  run = s.run('deploy', 'legacy-no-password-app-for-selftest');
  run.waitSecs(5);
  run.matchErr('Email:');
  run.write('test@test.com\n');
  run.matchErr('Password:');
  run.write('testtest\n');
  run.waitSecs(60);
  run.match('Now serving at legacy-no-password-app-for-selftest.meteor.com');
  run.expectExit(0);

  logout();

  // Deploying to legacy-password-app-for-selftest should prompt us to
  // login, and then tell us about 'meteor claim'.
  run = s.run('deploy', 'legacy-password-app-for-selftest');
  run.waitSecs(5);
  run.matchErr('Email:');
  run.write('test@test.com\n');
  run.matchErr('Password:');
  run.write('testtest\n');
  run.waitSecs(5);
  run.matchErr('meteor claim');
  run.expectExit(1);

  logout();

  // Deploying a new app using a user that exists but has no password
  // set should prompt us to set a password.
  run = s.run('deploy', appName);
  run.waitSecs(5);
  run.matchErr('Email:');
  run.write('user.forselftest.without.password@meteor.com\n');
  run.waitSecs(5);
  run.matchErr('already in use');
  run.matchErr('pick a password');
  run.stop();

});
