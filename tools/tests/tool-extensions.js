var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

function writeFakeNativePackage(s) {
  s.mkdir('packages');
  s.mkdir('packages/fake-native');
  s.write('packages/fake-native/package.js', `
Package.describe({
  name: 'fake-native',
  version: '1.0.0',
  summary: 'Fake native provider for tool extension selftests',
});

Package.registerToolExtension({
  id: 'meteor:fake-native',
  label: 'Fake Native',
  apiVersion: '1.0',
  platforms: [
    {
      name: 'fake-native',
      kind: 'test',
      provider: 'fake-native',
      buildTargets: ['web.fake-native'],
      hcpMode: 'none',
    },
  ],
  buildTargets: [
    {
      name: 'web.fake-native',
      baseArch: 'web.browser',
      outputKind: 'web-dir',
      runtime: 'test',
      hcpMode: 'none',
    },
  ],
  capabilities: {
    addPlatform: true,
    removePlatform: true,
    run: true,
    build: true,
  },
});
`);
}

selftest.define('tool-extension add and remove fake platform', async function () {
  const s = new Sandbox();
  await s.init();
  await s.createApp('myapp', 'standard-app');
  s.cd('myapp');
  writeFakeNativePackage(s);

  let run = s.run('add', 'fake-native');
  await run.waitSecs(60);
  await run.expectExit(0);

  run = s.run('add-platform', 'fake-native');
  await run.waitSecs(60);
  await run.match('fake-native: added platform');
  await run.expectExit(0);

  selftest.expectTrue(
    s.read('.meteor/platforms').includes('fake-native')
  );

  run = s.run('remove-platform', 'fake-native');
  await run.waitSecs(60);
  await run.match('fake-native: removed platform');
  await run.expectExit(0);

  selftest.expectFalse(
    s.read('.meteor/platforms').includes('fake-native')
  );
});

selftest.define('tool-extension build accepts fake platform', async function () {
  const s = new Sandbox();
  await s.init();
  await s.createApp('myapp', 'standard-app');
  s.cd('myapp');
  writeFakeNativePackage(s);

  let run = s.run('add', 'fake-native');
  await run.waitSecs(60);
  await run.expectExit(0);

  run = s.run('build', '../out', '--directory', '--platforms=fake-native');
  await run.waitSecs(120);
  await run.expectExit(0);
});

selftest.define('tool-extension run accepts fake platform as target', async function () {
  const s = new Sandbox();
  await s.init();
  await s.createApp('myapp', 'standard-app');
  s.cd('myapp');
  writeFakeNativePackage(s);

  let run = s.run('add', 'fake-native');
  await run.waitSecs(60);
  await run.expectExit(0);

  run = s.run('run', 'fake-native', '--once');
  await run.waitSecs(120);
  await run.match('App running');
  await run.stop();
});
