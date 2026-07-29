var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var testUtils = require('../tool-testing/test-utils.js');

selftest.define('deploy interactive prompt test', ['net'], async function () {
  var s = new Sandbox();
  await s.init();

  var appName = testUtils.randomAppName();
  await s.createApp(appName, 'standard-app');
  s.cd(appName);

  // Run deploy without site argument – it will trigger login and site prompts.
  var loginRun = s.run('login');
  await loginRun.matchErr('Email:');
  loginRun.write('test@test.com\n');
  await loginRun.matchErr('Password:');
  loginRun.write('testtest\n');
  await loginRun.expectExit(0);
  var run = s.run('deploy');

  // Wait for site selection prompt.
  await run.match(/Which site do you want to deploy to\?/);
  // Choose the default "new site" option.
  await run.write('\n');
  await run.match(/Enter the site name/);
  // Type a site name.
  run.write('mynewsite.meteorapp.com\n');

  // Ensure the site name appears only once and the command exits (expected failure without a token).
  await run.match('mynewsite.meteorapp.com');
  await run.expectExit(1);
});
