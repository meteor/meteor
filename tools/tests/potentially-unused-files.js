import * as selftest from '../tool-testing/selftest.js';

selftest.define('watch-used-files', async () => {
  const s = new selftest.Sandbox();
  await s.init();

  await s.createApp('myapp', 'watch-used-files');
  s.cd('myapp');

  let run = s.run();
  run.waitSecs(30);
  await run.match('App running at');

  function checkClientRefresh() {
    return run.match('Client modified -- refreshing');
  }

  async function checkServerRestart() {
    await run.match('Server modified -- restarting');
    await run.match('Meteor server restarted');
  }

  s.write(
    '/client-only.js',
    '// updated'
  );
  run.waitSecs(5);
  await checkClientRefresh();

  s.write(
    '/server-only.js',
    '// updated'
  );
  run.waitSecs(5);
  await checkServerRestart();

  s.write(
    '/shared.js',
    '// updated'
  );
  run.waitSecs(5);
  await checkServerRestart();

  s.write(
    '/unused.js',
    '// updated'
  );
  run.waitSecs(5);
  let rebuild = true;
  try {
    await checkServerRestart();
  } catch (e) {
    rebuild = false;
  }

  if (rebuild) {
    throw new Error('rebuild after unused file modified');
  }
});

selftest.define('watch-used-files-packages', async () => {
  const s = new selftest.Sandbox();
  await s.init();

  await s.createApp('myapp', 'watch-used-files');
  s.cd('myapp');

  let run = s.run();
  run.waitSecs(30);
  await run.match('App running at');

  function checkClientRefresh() {
    return run.match('Client modified -- refreshing');
  }

  async function checkServerRestart() {
    await run.match('Server modified -- restarting');
    await run.match('Meteor server restarted');
  }

  s.write(
    '/packages/partially-used-package/client-only.js',
    '// updated'
  );
  run.waitSecs(5);
  await checkClientRefresh();

  s.write(
    '/packages/partially-used-package/direct-import.js',
    '// updated'
  );
  run.waitSecs(5);
  await checkClientRefresh();

  s.write(
    '/packages/partially-used-package/server-only.js',
    '// updated'
  );
  run.waitSecs(5);
  await checkServerRestart();

  s.write(
    '/packages/partially-used-package/shared.js',
    '// updated'
  );
  run.waitSecs(5);
  await checkServerRestart();

  s.write(
    '/packages/partially-used-package/unused.js',
    '// updated'
  );
  run.waitSecs(5);
  let rebuild = true;
  try {
    await checkServerRestart();
  } catch (e) {
    rebuild = false;
  }

  if (rebuild) {
    throw new Error('rebuild after unused file modified');
  }
});

selftest.define('watch-used-files-plugins', async () => {
  const s = new selftest.Sandbox();
  await s.init();

  await s.createApp('myapp', 'watch-used-files');
  s.cd('myapp');

  let run = s.run();
  run.waitSecs(30);
  await run.match('App running at');

  function checkClientRefresh() {
    return run.match('Client modified -- refreshing');
  }

  async function checkServerRestart() {
    await run.match('Server modified -- restarting');
    await run.match('Meteor server restarted');
  }

  s.write(
    '/packages/build-plugin/plugin-dep.js',
    '// updated'
  );
  run.waitSecs(90);
  await checkServerRestart();

  s.write(
    '/unused.no-lazy-finalyzer',
    '// updated'
  );
  run.waitSecs(5);
  await checkServerRestart();

  s.write(
    '/a.time',
    '// updated'
  );
  run.waitSecs(5);
  let rebuild = true;
  try {
    await checkClientRefresh();
  } catch (e) {
    rebuild = false;
  }

  if (rebuild) {
    throw new Error('rebuild after a.time modified');
  }
});
