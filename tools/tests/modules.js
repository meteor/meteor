var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
import { getUrl } from '../utils/http-helpers.js';

var MONGO_LISTENING = {
  stdout: ' [initandlisten] waiting for connections on port',
};

async function startRun(sandbox) {
  var run = sandbox.run();
  await run.match('myapp');
  await run.match('proxy');
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(20);
  await run.match('MongoDB');
  return run;
}

selftest.define('modules - test app', async function() {
  const s = new Sandbox();
  await s.init();

  // Make sure we use the right "env" section of .babelrc.
  s.set('NODE_ENV', 'development');

  // For meteortesting:mocha to work we must set test browser driver
  // See https://github.com/meteortesting/meteor-mocha
  s.set('TEST_BROWSER_DRIVER', 'puppeteer');

  await s.createApp('modules-test-app', 'modules');
  await s.cd('modules-test-app', async function() {
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

selftest.define('modules - unimported lazy files', async function() {
  const s = new Sandbox();
  await s.init();

  await s.createApp('myapp', 'app-with-unimported-lazy-file');
  await s.cd('myapp', async function() {
    const run = s.run('--once');
    run.waitSecs(30);
    await run.expectExit(1);
    run.forbid("This file shouldn't be loaded");
  });
});

// Checks that `import X from 'meteor/package'` will import (and re-export) the
// mainModule if one exists, otherwise will simply export Package['package'].
// Overlaps with compiler-plugin.js's "install-packages.js" code.
selftest.define('modules - import chain for packages', async () => {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  await s.createApp('myapp', 'package-tests');
  s.cd('myapp');

  s.write(
    '.meteor/packages',
    ['meteor-base', 'modules', 'with-add-files', 'with-main-module', ''].join(
      '\n'
    )
  );

  s.write(
    'main.js',
    [
      "var packageNameA = require('meteor/with-add-files').name;",
      "var packageNameB = require('meteor/with-main-module').name;",
      '',
      "console.log('with-add-files: ' + packageNameA);",
      "console.log('with-main-module: ' + packageNameB);",
      '',
    ].join('\n')
  );

  const run = await startRun(s);

  run.waitSecs(30);

  // On the server, we just check that importing *works*, not *how* it works
  await run.match('with-add-files: with-add-files');
  await run.match('with-main-module: with-main-module');

  // On the client, we just check that install() is called correctly
  await checkModernAndLegacyUrls('/packages/modules.js', body => {
    selftest.expectTrue(body.includes('\ninstall("with-add-files");'));
    selftest.expectTrue(
      body.includes(
        '\ninstall("with-main-module", ' +
          '"meteor/with-main-module/with-main-module.js");'
      )
    );
  });

  await run.stop();
});

async function checkModernAndLegacyUrls(path, test) {
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  test(await getUrl('http://localhost:3000' + path));
  test(await getUrl('http://localhost:3000/__browser.legacy' + path));
}
