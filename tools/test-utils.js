randomString = function (charsCount) {
  var chars = 'abcdefghijklmnopqrstuvwxyz';
  var str = '';
  for (var i = 0; i < charsCount; i++) {
    str = str + chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return str;
};

randomAppName = function () {
  return 'selftest-app-' + randomString(10);
};

// Deploys an app with an old release from the current
// directory. Returns the name of the deployed app.
createAndDeployLegacyApp = function (sandbox, password) {
  var name = randomAppName();
  sandbox.createApp(name, 'empty');
  sandbox.cd(name);

  var runArgs = ['deploy', '--release', '0.7.0.1', name];
  if (password)
    runArgs.push('-P');

  var run = sandbox.run.apply(sandbox, runArgs);

  if (password) {
    // Give it time to download and install a new release, if necessary.
    run.waitSecs(30);
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

cleanUpLegacyApp = function (sandbox, name, password) {
  var run = sandbox.run('deploy', '--release', '0.7.0.1', '-D', name);
  if (password) {
    run.waitSecs(10);
    run.match('Password:');
    run.write(password + '\n');
  }
  run.waitSecs(20);
  run.match('Deleted');
  run.expectExit(0);
};

createAndDeployApp = function (sandbox) {
  var name = randomAppName();
  sandbox.createApp(name, 'empty');
  sandbox.cd(name);
  var run = sandbox.run('deploy', name);
  run.waitSecs(90);
  run.match('Now serving at ' + name + '.meteor.com');
  run.waitSecs(10);
  run.expectExit(0);
  return name;
};

cleanUpApp = function (sandbox, name) {
  var run = sandbox.run('deploy', '-D', name);
  run.waitSecs(90);
  run.match('Deleted');
  run.expectExit(0);
  return name;
};

login = function (s, username, password) {
  var run = s.run('login');
  run.waitSecs(2);
  run.matchErr('Username:');
  run.write(username + '\n');
  run.matchErr('Password:');
  run.write(password + '\n');
  run.waitSecs(5);
  run.matchErr('Logged in as ' + username + ".");
  run.expectExit(0);
};

logout = function (s) {
  var run = s.run('logout');
  run.waitSecs(5);
  run.matchErr('Logged out');
  run.expectExit(0);
};
