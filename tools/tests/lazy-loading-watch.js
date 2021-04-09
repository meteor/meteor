import * as selftest from '../tool-testing/selftest.js';

selftest.define('lazy loading watch', () => {
  const s = new selftest.Sandbox();
  s.createApp('myapp', 'lazy-loading-watch');
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

  const constantsFileClientOnly = '/infra/constants-client.js';
  s.write(
    constantsFileClientOnly,
    s
      .read(constantsFileClientOnly)
      .replace(/my constant client/, 'my constant client changed')
  );
  run.waitSecs(5);
  checkClientRefresh();

  const constantsFileServerOnly = '/infra/constants-server.js';
  s.write(
    constantsFileServerOnly,
    s
      .read(constantsFileServerOnly)
      .replace(/my constant server/, 'my constant server changed')
  );
  run.waitSecs(5);
  checkServerRestart();

  const constantsFileBoth = '/infra/constants-both.js';
  s.write(
    constantsFileBoth,
    s
      .read(constantsFileBoth)
      .replace(/my constant both/, 'my constant both changed')
  );
  run.waitSecs(5);
  checkServerRestart();
});
