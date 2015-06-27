var _ = require('underscore');
var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var testUtils = require('../test-utils.js');
var config = require("../config.js");

// XXX need to make sure that mother doesn't clean up:
// 'legacy-password-app-for-selftest'
// 'legacy-no-password-app-for-selftest'
// 'app-for-selftest-not-test-owned'
// 'app-for-selftest-test-owned'

var commandTimeoutSecs = testUtils.accountsCommandTimeoutSecs;
var loginTimeoutSecs = 2;

// Run 'meteor logs' or 'meteor mongo' against an app. Options:
//  - legacy: boolean
//  - passwordProtected: if legacy is true, then true if the app has a
//    password set
//  - loggedIn: if true, the user is currently logged in, so we should
//    not expect a login prompt
//  - authorized: if loggedIn is true, then this boolean should indicate
//    whether the current user is authorized for the app
//  - username: the username to use if given a login prompt (defaults to
//    'test')
//  - password: the password to use if given a login prompt (defaults to
//   'testtest');
var logsOrMongoForApp = function (sandbox, command, appName, options) {

  if (appName.indexOf(".") === -1) {
    appName = appName + "." + config.getDeployHostname();
  }

  var runArgs = [command, appName];
  var matchString;
  if (command === 'mongo') {
    runArgs.push('--url');
    matchString = 'mongodb://';
  } else if (command === 'logs') {
    // I suppose it's possible that we don't have any INFO messages in
    // the logs, but it seems unlikely. Every time we run a command we
    // hit /_GALAXY_ on the site.
    // XXX This is no longer true now that we've removed legacy Galaxy
    // prototype support, so if this causes test flakiness, it may
    // need to be tweaked.
    matchString = 'INFO';
  } else {
    throw new Error('Command must be "logs" or "mongo"');
  }

  var run = sandbox.run.apply(sandbox, runArgs);
  run.waitSecs(commandTimeoutSecs);

  var expectSuccess = selftest.markStack(function () {
    run.waitSecs(2);
    run.match(matchString);
    run.expectExit(0);
  });

  var expectUnauthorized = selftest.markStack(function () {
    run.matchErr('belongs to a different user');
    run.expectExit(1);
  });

  if (options.legacy) {
    if (options.passwordProtected) {
      run.matchErr('meteor claim');
      run.expectExit(1);
    } else {
      // Getting logs or mongo for a non-password-protected legacy app
      // should just work, without a login or registration prompt.
      expectSuccess();
    }
  } else {
    if (options.loggedIn) {
      if (options.authorized) {
        expectSuccess();
      } else {
        expectUnauthorized();
      }
    } else {
      // If we are not logged in and this is not a legacy app, then we
      // expect a login prompt.
      //
      // (If testReprompt is true, try getting reprompted as a result
      // of entering no username or a bad password.)
      run.waitSecs(loginTimeoutSecs);
      if (options.testReprompt) {
        run.matchErr('Username: ');
        run.write("\n");
        run.matchErr("Username:");
        run.write("   \n");
      }
      run.matchErr('Username: ');
      run.waitSecs(loginTimeoutSecs);
      run.write((options.username || 'test') + '\n');
      if (options.testReprompt) {
        run.matchErr("Password:");
        run.write("wrongpassword\n");
        run.waitSecs(15);
        run.matchErr("failed");
      }
      run.matchErr('Password: ');
      run.write((options.password || 'testtest') + '\n');
      run.waitSecs(commandTimeoutSecs);
      if (options.authorized) {
        expectSuccess();
      } else {
        expectUnauthorized();
      }
    }
  }
};


_.each([false, true], function (loggedIn) {
  _.each(['logs', 'mongo'], function (command) {
    selftest.define(
      command + ' - ' + (loggedIn ? 'logged in' : 'logged out'),
      ['net'],
      function () {
        var s = new Sandbox;
        var run;
        if (loggedIn) {
          run = s.run('login');
          run.waitSecs(commandTimeoutSecs);
          run.matchErr('Username:');
          run.write('test\n');
          run.matchErr('Password:');
          run.write('testtest\n');
          run.waitSecs(commandTimeoutSecs);
          run.matchErr('Logged in as test.');
          run.expectExit(0);
        }

        // Running 'meteor logs' without an app name should fail.
        if (command === 'logs') {
          run = s.run(command);
          run.matchErr('not enough arguments');
          run.expectExit(1);
        }
        // Running 'meteor mongo' without an app name and not in an app
        // dir should fail.
        if (command === 'mongo') {
          run = s.run('mongo');
          run.matchErr('not in a Meteor project directory');
          run.expectExit(1);
        }

        logsOrMongoForApp(s, command,
                          'legacy-no-password-app-for-selftest', {
                            legacy: true,
                            passwordProtected: false,
                            loggedIn: loggedIn
                          });

        logsOrMongoForApp(s, command,
                          'legacy-password-app-for-selftest', {
                            legacy: true,
                            passwordProtected: true,
                            loggedIn: loggedIn
                          });

        logsOrMongoForApp(s, command,
                          'app-for-selftest-not-test-owned', {
                            loggedIn: loggedIn,
                            authorized: false,
                            testReprompt: true
                          });

        if (! loggedIn) {
          // We logged in as a result of running the previous command,
          // so log out again.
          run = s.run('logout');
          run.waitSecs(commandTimeoutSecs);
          run.matchErr('Logged out');
          run.expectExit(0);
        }

        logsOrMongoForApp(s, command,
                          'app-for-selftest-test-owned', {
                            loggedIn: loggedIn,
                            authorized: true
                          });

        // Again, we logged in as a result of running the previous
        // command if we weren't logged in already, so log out now to
        // clean up our token.
        testUtils.logout(s);
      });
  });
});
