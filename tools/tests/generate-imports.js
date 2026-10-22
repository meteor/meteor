const selftest = require('../tool-testing/selftest.js');

selftest.define('generate - custom server import destination', async function () {
  const sandbox = new selftest.Sandbox();
  await sandbox.init();
  await sandbox.createApp('generated-app', 'standard-app');
  await sandbox.cd('generated-app', async () => {
    sandbox.write('server/main.js', '// default entry\n');
    sandbox.write('server/custom.js', '// custom entry\n');
    const run = sandbox.run('generate', 'items', '--serverImportFile', 'server/custom.js');
    run.waitSecs(30);
    await run.expectExit(0);
    selftest.expectEqual(sandbox.read('server/main.js'), '// default entry\n');
    selftest.expectEqual(sandbox.read('server/custom.js'), "import '/imports/api/items';\n// custom entry\n");
  });
});
