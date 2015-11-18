const selftest = require('../tool-testing/selftest.js');
const Sandbox = selftest.Sandbox;
const files = require('../fs/files.js');

selftest.define('tests compilation - in development', function () {
  const s = new Sandbox();
  s.createApp('app-with-tests', 'app-with-tests');
  s.cd('app-with-tests');
  const run = s.run();
  run.waitSecs(60);
  run.match('App running');
  // Make sure that the tests are not executed in the app automatically
  // This only checks the server side. Client side is not tested automatically.
  run.forbid('test executed');
  run.stop();

  const doesTestExist = (testPath) => files.exists(
    files.pathJoin(s.cwd, '.meteor/local/build/programs/', testPath)
  );

  selftest.expectTrue(doesTestExist('server/app/tests/my-common-test.js'));
  selftest.expectFalse(doesTestExist('server/app/tests/client/my-client-test.js'));
  selftest.expectTrue(doesTestExist('server/app/tests/server/my-server-test.js'));
  selftest.expectTrue(doesTestExist('server/app/my-feature/tests/my-common-test.js'));
  selftest.expectFalse(doesTestExist('server/app/my-feature/tests/client/my-client-test.js'));
  selftest.expectTrue(doesTestExist('server/app/my-feature/tests/server/my-server-test.js'));

  selftest.expectTrue(doesTestExist('web.browser/app/tests/my-common-test.js'));
  selftest.expectTrue(doesTestExist('web.browser/app/tests/client/my-client-test.js'));
  selftest.expectFalse(doesTestExist('web.browser/app/tests/server/my-server-test.js'));
  selftest.expectTrue(doesTestExist('web.browser/app/my-feature/tests/my-common-test.js'));
  selftest.expectTrue(doesTestExist('web.browser/app/my-feature/tests/client/my-client-test.js'));
  selftest.expectFalse(doesTestExist('web.browser/app/my-feature/tests/server/my-server-test.js'));
});

selftest.define('tests compilation - not in production', function () {
  const s = new Sandbox();
  s.createApp('app-with-tests', 'app-with-tests');
  s.cd('app-with-tests');
  const run = s.run('build', '--debug', '--directory', '.');
  run.waitSecs(60);
  run.expectExit();
  run.stop();

  const doesTestExist = (testPath) => files.exists(
    files.pathJoin(s.cwd, 'bundle/programs/', testPath)
  );

  selftest.expectFalse(doesTestExist('server/app/tests/my-common-test.js'));
  selftest.expectFalse(doesTestExist('server/app/tests/client/my-client-test.js'));
  selftest.expectFalse(doesTestExist('server/app/tests/server/my-server-test.js'));
  selftest.expectFalse(doesTestExist('server/app/my-feature/tests/my-common-test.js'));
  selftest.expectFalse(doesTestExist('server/app/my-feature/tests/client/my-client-test.js'));
  selftest.expectFalse(doesTestExist('server/app/my-feature/tests/server/my-server-test.js'));

  selftest.expectFalse(doesTestExist('web.browser/app/tests/my-common-test.js'));
  selftest.expectFalse(doesTestExist('web.browser/app/tests/client/my-client-test.js'));
  selftest.expectFalse(doesTestExist('web.browser/app/tests/server/my-server-test.js'));
  selftest.expectFalse(doesTestExist('web.browser/app/my-feature/tests/my-common-test.js'));
  selftest.expectFalse(doesTestExist('web.browser/app/my-feature/tests/client/my-client-test.js'));
  selftest.expectFalse(doesTestExist('web.browser/app/my-feature/tests/server/my-server-test.js'));
});
