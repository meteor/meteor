var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var testUtils = require('../tool-testing/test-utils.js');

selftest.define('deploy interactive site prompt', ['net'], async function () {
  var s = new Sandbox();
  await s.init();

  var appName = testUtils.randomAppName();
  await s.createApp(appName, 'standard-app');
  s.cd(appName);

  await testUtils.login(s, 'test', 'testtest');

  // Non-interactive runs must keep the old error: the harness spawns
  // commands with piped stdio (no TTY), so a plain run hits the guard.
  var run = s.run('deploy');
  run.waitSecs(30);
  await run.matchErr('site is required');
  await run.expectExit(1);

  // Now opt in to the prompts despite the missing TTY.
  s.set('METEOR_FORCE_INTERACTIVE', 't');

  run = s.run('deploy');
  run.waitSecs(30);

  // The shared test account may or may not own deployed sites, so either the
  // site picker or the free-text prompt can come first.
  await run.match(/Which site do you want to deploy to\?|Enter the site name/);

  // An Enter keypress converges both paths onto the free-text prompt: in the
  // picker it selects the default "+ Deploy to a new site..." choice, and at
  // the free-text prompt the empty answer fails validation and re-prompts.
  run.write('\n');
  await run.match(/Enter the site name|Please enter a site name/);

  run.write('mynewsite.meteorapp.com\n');
  // Inquirer echoes the accepted answer; that's the wizard's job done.
  // Everything past this point is the pre-existing deploy path, so stop the
  // run rather than waiting out a full build-and-deploy attempt.
  await run.match('mynewsite.meteorapp.com');
  await run.stop();
});
