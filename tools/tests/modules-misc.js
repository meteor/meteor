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

async function checkModernAndLegacyUrls(path, test) {
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  test(await getUrl('http://localhost:3000' + path));
  test(await getUrl('http://localhost:3000/__browser.legacy' + path));
}

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
  // Enable legacy transpiler for testing as babel compiler is used.
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = '{ "webArchOnly": false }';

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

  process.env.METEOR_MODERN = currentMeteorModern;
});
