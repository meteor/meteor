var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define('modules - test modern app', async function() {
  const s = new Sandbox();
  await s.init();

  // Make sure we use the right "env" section of .babelrc.
  s.set('NODE_ENV', 'development');

  // For meteortesting:mocha to work we must set test browser driver
  // See https://github.com/meteortesting/meteor-mocha
  s.set('TEST_BROWSER_DRIVER', 'puppeteer');

  await s.createApp('modules-modern-test-app', 'modules-modern');
  await s.cd('modules-modern-test-app', async function() {
    const run = s.run(
        'test',
        '--once',
        '--full-app',
        '--driver-package',
        // Not running with the --full-app option here, in order to exercise
        // the normal `meteor test` behavior.
        "meteortesting:mocha"
    );

    run.waitSecs(60);
    await run.match('App running at');
    await run.match('SERVER FAILURES: 0');
    await run.match('CLIENT FAILURES: 0');
    await run.expectExit(0);
  });
});
