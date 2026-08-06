const selftest = require('../tool-testing/selftest.js');
const Sandbox = selftest.Sandbox;

function packageJson(mode) {
  return JSON.stringify({
    name: 'test-runner-provider',
    private: true,
    dependencies: {
      '@babel/runtime': '^7.23.5',
      'meteor-node-stubs': '^1.2.12',
    },
    meteor: { fakeProviderMode: mode },
  }, null, 2) + '\n';
}

async function createProviderApp() {
  const sandbox = new Sandbox();
  await sandbox.init();
  await sandbox.createApp('provider-app', 'test-runner-provider');
  sandbox.cd('provider-app');
  sandbox.set('');
  return sandbox;
}

selftest.define('test-runner-providers - native and host lifecycle', async () => {
  const sandbox = await createProviderApp();

  let run = sandbox.run('test', '--once');
  run.waitSecs(60);
  await run.match('[fake-provider] factory');
  await run.match('[fake-provider] validate');
  await run.match('[fake-provider] prepare');
  await run.match('[fake-provider] start-before-host');
  await run.match('[fake-provider] stop');
  await run.expectExit(0);
  run.forbid('Started proxy');

  sandbox.write('package.json', packageJson('host'));
  run = sandbox.run('test', '--once', '--port', '3710');
  run.waitSecs(120);
  await run.match('[fake-provider] factory');
  await run.match('[fake-provider] validate');
  await run.match('[fake-provider] prepare');
  await run.match('[fake-provider] start-before-host');
  await run.match('[fake-provider] before-app-run');
  run.waitSecs(240);
  await run.match('[fake-provider] start-host');
  await run.match('[fake-provider-runtime] complete');
  await run.match('[fake-provider] stop');
  await run.expectExit(0);
});

selftest.define('test-runner-providers - errors and driver bypass', async () => {
  const sandbox = await createProviderApp();

  sandbox.write('package.json', packageJson('validation-error'));
  let run = sandbox.run('test', '--once');
  run.waitSecs(60);
  await run.matchErr('Fake provider validation failed before prepare.');
  await run.expectExit(1);
  run.forbid('[fake-provider] prepare');

  sandbox.write('package.json', packageJson('native-fail'));
  run = sandbox.run('test', '--once');
  run.waitSecs(60);
  await run.match('[fake-provider] start-before-host');
  await run.match('[fake-provider] stop');
  await run.expectExit(7);

  sandbox.write('package.json', packageJson('host-error'));
  run = sandbox.run('test', '--once', '--port', '3711');
  run.waitSecs(120);
  await run.match('[fake-provider] start-host');
  await run.matchErr('Fake provider host failed after app startup.');
  await run.match('[fake-provider] stop');
  await run.expectExit(254);

  sandbox.write('package.json', packageJson('before-error'));
  run = sandbox.run('test', '--once', '--port', '3712');
  run.waitSecs(120);
  await run.match('[fake-provider] before-app-run');
  await run.matchErr('Fake provider generation failed before app build.');
  await run.match('[fake-provider] stop');
  await run.expectExit(254);
  run.forbid('[fake-provider] start-host');

  run = sandbox.run('test', '--once', '--test-runner', 'missing');
  run.waitSecs(60);
  await run.matchErr('Unknown test runner "missing" from --test-runner');
  await run.expectExit(1);

  run = sandbox.run('test', '--once', '--test-runner', 'driver');
  run.waitSecs(30);
  await run.matchErr('--test-runner selects a registered test-runner provider');
  await run.matchErr('Use --driver-package <name>');
  await run.expectExit(1);
  run.forbid('[fake-provider] factory');
});

selftest.define('test-runner-providers - automatic conflict', async () => {
  const sandbox = await createProviderApp();
  sandbox.write(
    '.meteor/packages',
    `${sandbox.read('.meteor/packages')}\nfake-provider-two\n`
  );

  const run = sandbox.run('test', '--once');
  run.waitSecs(60);
  await run.matchErr('Multiple test runner providers are active');
  await run.matchErr('fake');
  await run.matchErr('fake-two');
  await run.expectExit(1);
  run.forbid('Started proxy');
});
