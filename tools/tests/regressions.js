var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define('regressions - web.browser.legacy', function() {
  const s = new Sandbox();

  // Make sure we use the right "env" section of .babelrc.
  s.set('NODE_ENV', 'development');

  // For meteortesting:mocha to work we must set test browser driver
  // See https://github.com/meteortesting/meteor-mocha
  s.set('TEST_BROWSER_DRIVER', 'puppeteer');

  s.createApp('modules-test-app', 'ecmascript-regression');
  s.cd('modules-test-app', function() {
    const run = s.run(
      'test',
      '--once',
      '--full-app',
      '--driver-package',
      'meteortesting:mocha',
      '--exclude-archs',
      'web.browser'
    );

    run.waitSecs(60);
    run.match('App running at');
    run.match('SERVER FAILURES: 0');
    run.match('CLIENT FAILURES: 0');
    run.expectExit(0);
  });
});
