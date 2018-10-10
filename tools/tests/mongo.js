var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils/utils.js');
var net = require('net');
var Future = require('fibers/future');
var _ = require('underscore');
var files = require('../fs/files.js');

// Tests that observeChanges continues to work even over a mongo failover.
selftest.define("mongo failover", ["slow"], function () {
  var s = new Sandbox();
  s.set('METEOR_TEST_MULTIPLE_MONGOD_REPLSET', 't');
  s.createApp("failover-test", "failover-test");
  s.cd("failover-test");

  var run = s.run("--once", "--raw-logs");
  run.waitSecs(120);
  run.match("SUCCESS\n");
  run.expectEnd();
  run.expectExit(0);
});

var testMeteorMongo = function (appDir) {
  var s = new Sandbox();
  s.createApp(appDir, 'standard-app');
  s.cd(appDir);

  var run = s.run();
  run.match(appDir);
  run.match('proxy');
  run.waitSecs(15);
  run.match('Started MongoDB');

  var mongoRun = s.run('mongo');
  mongoRun.match('MongoDB shell');
  mongoRun.match(/connecting to: (.*)127.0.0.1/);
  // Note: when mongo shell's input is not a tty, there is no prompt.
  mongoRun.write('db.version()\n');
  mongoRun.match(/3\.\d+\.\d+/);
  mongoRun.stop();

  run.stop();
};

selftest.define("meteor mongo", function () {
  testMeteorMongo('asdfzasdf');
});

// Regression test for #3999.  Note the Cyrillic character in the pathname.
//
// XXX This test fails on Windows for two different reasons:
// - With the Unicode directory name, `meteor run` fails to start mongod
// - If you change appDir to not have the Unicode character, the reads
//   from the mongo shell process seem to be randomly corrupted
// https://github.com/meteor/windows-preview/issues/145
selftest.define("meteor mongo in unicode dir", function () {
  testMeteorMongo('asdf\u0442asdf');
});

selftest.define("mongo with multiple --port numbers (#7563)", function () {
  var s = new Sandbox();
  s.createApp("mongo-multiple-ports", "mongo-sanity");
  s.cd("mongo-multiple-ports");

  function check(args, matches) {
    const run = s.run(...args);
    run.waitSecs(30);
    matches.forEach(m => {
      run.waitSecs(10);
      run.match(m);
    });
    run.stop();
  }

  // Make absolutely sure we're creating the database for the first time.
  check(["reset"], ["Project reset."]);

  let count = 0;
  function next() {
    return ["Started MongoDB", "count: " + (++count)];
  }

  check(["run"], next());
  check(["--port", "4321"], next());
  check(["--port", "4123"], next());
  check([], next());
});
