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

selftest.define('regressions - linker cache cleanup (#14642)', async function() {
  const s = new Sandbox();
  await s.init();
  await s.createApp('linker-test-app', 'client-refresh');
  await s.cd('linker-test-app', async function() {
    const run = s.run();

    run.waitSecs(60);
    await run.match('Started proxy');
    await run.match('App running at');

    // Modify file 3 times to generate initial cache
    for (let i = 0; i < 3; i++) {
      s.append('client/main.js', '\nconsole.log("change ' + i + '");\n');
      await run.match('Client modified -- refreshing');
    }

    // check cache files
    const fs = require('fs');
    const path = require('path');
    const cacheDir = path.join(s.cwd, '.meteor/local/bundler-cache/linker');
    let files = fs.readdirSync(cacheDir);
    const beforeCount = files.filter(f => f.endsWith('.cache')).length;

    // Modify file 5 more times
    for (let i = 3; i < 8; i++) {
      s.append('client/main.js', '\nconsole.log("change ' + i + '");\n');
      await run.match('Client modified -- refreshing');
    }

    let afterCount;
    const deadline = Date.now() + 10000;
    do {
      files = fs.readdirSync(cacheDir);
      afterCount = files.filter(f => f.endsWith('.cache')).length;
      if (afterCount <= beforeCount + 2) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);

    // If the cache isn't being cleaned up, it would grow exactly by 5
    if (afterCount > beforeCount + 2) {
      selftest.fail('Linker cache is growing indefinitely. before: ' + beforeCount + ', after: ' + afterCount);
    }

    run.stop();
  });
});
