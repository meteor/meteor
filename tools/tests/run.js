var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../fs/files');
var os = require('os');

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

selftest.define("run", async function () {
  var s = new Sandbox({ fakeMongo: true });
  await s.init();

  var run;

  // Starting a run
  await s.createApp("myapp", "standard-app");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.convertToOSPath(files.mkdtemp()));
  run = s.run();
  await run.match("myapp");
  await run.match("proxy");
  await run.tellMongo(MONGO_LISTENING);
  await run.match("MongoDB");
  await run.match("your app");
  run.waitSecs(5);
  await run.match("running at");
  await run.match("localhost");

  // File change
  s.write("empty.js", "");
  run.waitSecs(2);
  await run.match("restarted");
  s.write("empty.js", " ");
  run.waitSecs(2);
  await run.match("restarted");
  // XXX want app to generate output so that we can see restart counter reset

  // Crashes
  s.write("crash.js", "process.exit(42);");
  run.waitSecs(5);
  await run.match("with code: 42");
  run.waitSecs(5);
  await run.match("is crashing");
  s.unlink("crash.js");
  run.waitSecs(5);
  await run.match("Modified");
  run.waitSecs(5);
  await run.match("restarted");
  s.write("empty.js", "");
  run.waitSecs(5);
  // We used to see the restart counter reset but right now restart messages
  // don't coalesce due to intermediate use of the progress bar.
  await run.match("restarted");
  s.write("crash.js", "process.kill(process.pid, 'SIGKILL');");
  run.waitSecs(5);
  await run.match("Exited");
  await run.match("is crashing");

  // Bundle failure
  s.unlink("crash.js");
  s.write("junk.css", "/*");
  run.waitSecs(5);
  await run.match("Modified");
  await run.match("prevented startup");
  await run.match("Unclosed comment");
  await run.match("file change");

  // Back to working
  s.unlink("junk.css");
  run.waitSecs(5);
  await run.match("restarted");
  await run.stop();

  run = s.run('--settings', 's.json');
  run.waitSecs(5);
  await run.match('s.json: file not found (settings file)');
  await run.match('Waiting for file change');
  s.write('s.json', '}');
  await run.match('s.json: parse error reading settings file');
  await run.match('Waiting for file change');
  s.write('s.json', '{}');
  run.waitSecs(15);
  await run.match('App running at');
  await run.stop();

  // Make sure a directory passed to --settings does not cause an infinite
  // re-build loop (issue #3854).
  run = s.run('--settings', os.tmpdir());
  await run.match(`${os.tmpdir()}: file not found (settings file)`);
  await run.match('Waiting for file change');
  run.forbid('Modified -- restarting');
  await run.stop();

  // How about a bundle failure right at startup
  s.write("junk.css", "/*");
  run = s.run();
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(5);
  await run.match("prevented startup");
  await run.match("Unclosed comment");
  await run.match("file change");
  s.unlink("junk.css");
  run.waitSecs(5);
  await run.match("restarted");
  await run.stop();

// XXX --port, --production, --raw-logs, --settings, --program
});

selftest.define("run ROOT_URL must be an URL", async function () {
  var s = new Sandbox();
  await s.init();
  var run;

  s.set("ROOT_URL", "192.168.0.1");
  await s.createApp("myapp", "standard-app", { dontPrepareApp: true });
  s.cd("myapp");

  run = s.run();
  await run.matchErr("$ROOT_URL, if specified, must be an URL");
  await run.expectExit(1);
});

selftest.define("app starts when settings file has BOM", async function () {
  var s = new Sandbox({ fakeMongo: true });
  await s.init();

  var run;
  await s.createApp("myapp", "standard-app");
  s.cd("myapp");
  files.writeFile(
    files.pathJoin(s.cwd, "settings.json"),
    "\ufeff" + JSON.stringify({ foo: "bar" }),
  );
  run = s.run("--settings", "settings.json", "--once");
  await run.tellMongo(MONGO_LISTENING);
  run.forbid("Build failed");
});
