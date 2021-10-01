import * as selftest from '../tool-testing/selftest.js';

selftest.define('watch-used-files', () => {
  const s = new selftest.Sandbox();
  s.createApp('myapp', 'watch-used-files');
  s.cd('myapp');

  let run = s.run();
  run.waitSecs(30);
  run.match('App running at');

  function checkClientRefresh() {
    run.match('Client modified -- refreshing');
  }

  function checkServerRestart() {
    run.match('Server modified -- restarting');
    run.match('Meteor server restarted');
  }

  s.write(
    '/client-only.js',
    '// updated'
  );
  run.waitSecs(5);
  checkClientRefresh();

  s.write(
    '/server-only.js',
    '// updated'
  );
  run.waitSecs(5);
  checkServerRestart();

  s.write(
    '/shared.js',
    '// updated'
  );
  run.waitSecs(5);
  checkServerRestart();

  s.write(
    '/unused.js',
    '// updated'
  );
  run.waitSecs(5);
  let rebuild = true;
  try {
    checkServerRestart();
  } catch (e) {
    rebuild = false;
  }

  if (rebuild) {
    throw new Error('rebuild after unused file modified');
  }
});

selftest.define('watch-used-files-packages', () => {
  const s = new selftest.Sandbox();
  s.createApp('myapp', 'watch-used-files');
  s.cd('myapp');

  let run = s.run();
  run.waitSecs(30);
  run.match('App running at');

  function checkClientRefresh() {
    run.match('Client modified -- refreshing');
  }

  function checkServerRestart() {
    run.match('Server modified -- restarting');
    run.match('Meteor server restarted');
  }

  s.write(
    '/packages/partially-used-package/client-only.js',
    '// updated'
  );
  run.waitSecs(5);
  checkClientRefresh();

  s.write(
    '/packages/partially-used-package/direct-import.js',
    '// updated'
  );
  run.waitSecs(5);
  checkClientRefresh();

  s.write(
    '/packages/partially-used-package/server-only.js',
    '// updated'
  );
  run.waitSecs(5);
  checkServerRestart();

  s.write(
    '/packages/partially-used-package/shared.js',
    '// updated'
  );
  run.waitSecs(5);
  checkServerRestart();

  s.write(
    '/packages/partially-used-package/unused.js',
    '// updated'
  );
  run.waitSecs(5);
  let rebuild = true;
  try {
    checkServerRestart();
  } catch (e) {
    rebuild = false;
  }

  if (rebuild) {
    throw new Error('rebuild after unused file modified');
  }
});

selftest.define('watch-used-files-plugins', () => {
  const s = new selftest.Sandbox();
  s.createApp('myapp', 'watch-used-files');
  s.cd('myapp');

  let run = s.run();
  run.waitSecs(30);
  run.match('App running at');

  function checkClientRefresh() {
    run.match('Client modified -- refreshing');
  }

  function checkServerRestart() {
    run.match('Server modified -- restarting');
    run.match('Meteor server restarted');
  }

  s.write(
    '/packages/build-plugin/plugin-dep.js',
    '// updated'
  );
  run.waitSecs(90);
  checkServerRestart();

  s.write(
    '/unused.no-lazy-finalyzer',
    '// updated'
  );
  run.waitSecs(5);
  checkServerRestart();

  s.write(
    '/a.time',
    '// updated'
  );
  run.waitSecs(5);
  let rebuild = true;
  try {
    checkClientRefresh();
  } catch (e) {
    rebuild = false;
  }

  if (rebuild) {
    throw new Error('rebuild after a.time modified');
  }
});
