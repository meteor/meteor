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
