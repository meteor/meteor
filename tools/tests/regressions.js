var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define('regressions - web.browser.legacy', async function() {
  const s = new Sandbox();
  await s.init();

  // Make sure we use the right "env" section of .babelrc.
  s.set('NODE_ENV', 'development');

  // For meteortesting:mocha to work we must set test browser driver
  // See https://github.com/meteortesting/meteor-mocha
  s.set('TEST_BROWSER_DRIVER', 'puppeteer');

  await s.createApp('modules-test-app', 'ecmascript-regression');
  await s.cd('modules-test-app', async function() {
    const run = s.run(
      'test',
      '--once',
      '--full-app',
      '--driver-package',
      "meteortesting:mocha",
      '--exclude-archs',
      'web.browser'
    );

    run.waitSecs(60);
    await run.match('App running at');
    await run.match('SERVER FAILURES: 0');
    await run.match('CLIENT FAILURES: 0');
    await run.expectExit(0);
  });
});

selftest.define('regressions - missing Babel plugin is reported, not silently ignored (#11854)', async function() {
  const s = new Sandbox();
  await s.init();

  await s.createApp('babel-missing-plugin', 'ecmascript-regression');
  await s.cd('babel-missing-plugin', async function() {
    // The modern SWC transpiler does not read .babelrc, so force the classic
    // Babel transpiler for app code, where the plugin id is resolved.
    const pkg = JSON.parse(s.read('package.json'));
    pkg.meteor = Object.assign({}, pkg.meteor, {
      modern: { transpiler: { excludeApp: true } }
    });
    s.write('package.json', JSON.stringify(pkg, null, 2));

    // Reference a Babel plugin that is not installed.
    s.write('.babelrc', JSON.stringify({
      plugins: ['babel-plugin-this-does-not-exist-11854']
    }, null, 2));

    const run = s.run();
    run.waitSecs(120);
    // The unresolved plugin must be surfaced as a warning instead of being
    // silently dropped...
    await run.matchErr('unable to resolve "babel-plugin-this-does-not-exist-11854"');
    // ...while the build still succeeds and the app starts.
    await run.match('App running at');
    await run.stop();
  });
});
