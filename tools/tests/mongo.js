var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

// Tests that observeChanges continues to work even over a mongo failover.
selftest.define("mongo failover", ["slow"], async function () {
  var s = new Sandbox();
  await s.init();

  s.set('METEOR_TEST_MULTIPLE_MONGOD_REPLSET', 't');
  await s.createApp("failover-test", "failover-test");
  s.cd("failover-test");

  var run = s.run("--once", "--raw-logs");
  run.waitSecs(120);
  await run.match("SUCCESS\n");
  await run.expectEnd();
  await run.expectExit(0);
});

async function testMeteorMongo(appDir) {
  var s = new Sandbox();
  await s.init();

  await s.createApp(appDir, 'standard-app');
  s.cd(appDir);

  var run = s.run();
  await run.match(appDir);
  await run.match('proxy');
  run.waitSecs(15);
  await run.match('Started MongoDB');
  run.waitSecs(15);
  await run.match('App running');
  run.waitSecs(15);

  var mongoRun = s.run('mongo');
  mongoRun.waitSecs(15);

  // Make sure we match the DB version that's printed as part of the
  // non-quiet shell startup text, so that we don't confuse it with the
  // output of the db.version() command below.
  await mongoRun.match(/mongosh/);

  // Make sure the shell does not display the banner about Mongo's free
  // monitoring service.
  mongoRun.forbidAll("free cloud-based monitoring service");

  // Note: when mongo shell's input is not a tty, there is no prompt.
  mongoRun.write('db.version()\n');
  await mongoRun.match(/v5\.\d+\.\d+/);
  await mongoRun.stop();

  await run.stop();
}

selftest.define("meteor mongo", function () {
  return testMeteorMongo('asdfzasdf');
});

// Regression test for #3999.  Note the Cyrillic character in the pathname.
//
// XXX This test fails on Windows for two different reasons:
// - With the Unicode directory name, `meteor run` fails to start mongod
// - If you change appDir to not have the Unicode character, the reads
//   from the mongo shell process seem to be randomly corrupted
// https://github.com/meteor/windows-preview/issues/145
selftest.define("meteor mongo in unicode dir", function () {
  return testMeteorMongo('asdf\u0442asdf');
});

selftest.define("mongo with multiple --port numbers (#7563)", async function () {
  var s = new Sandbox();
  await s.init();

  await s.createApp("mongo-multiple-ports", "mongo-sanity");
  s.cd("mongo-multiple-ports");

  async function check(args, matches) {
    const run = s.run(...args);
    run.waitSecs(30);
    for (const m of matches) {
      run.waitSecs(10);
      await run.match(m);
    }
    await run.stop();
  }

  // Make absolutely sure we're creating the database for the first time.
  await check(["reset"], ["Project reset."]);

  let count = 0;
  function next() {
    return ["Started MongoDB", "count: " + (++count)];
  }

  await check(["run"], next());
  await check(["--port", "4321"], next());
  await check(["--port", "4123"], next());
  await check([], next());
});
