var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var archinfo = require('../utils/archinfo');
var release = require('../packaging/release.js');
var files = require('../fs/files');
var utils = require('../utils/utils.js');
var runMongo = require('../runners/run-mongo.js');

selftest.define("argument parsing", async function () {
  var s = new Sandbox;
  await s.init();

  var run;

  // bad command
  run = s.run("aoeuasdf");
  await run.matchErr("not a Meteor command");
  run.waitSecs(5);
  await run.expectExit(1);

  // bad subcommand
  run = s.run("admin", "aoeuasdf");
  await run.matchErr("not a Meteor command");
  run.waitSecs(5);
  await run.expectExit(1);

  // missing subcommand
  run = s.run("admin");
  await run.matchErr("for available commands");
  run.waitSecs(5);
  await run.expectExit(1);

  // conflicting command-like options
  run = s.run("aoeuasdf", "--version");
  await run.matchErr("pass anything else along with --version");
  run.waitSecs(5);
  await run.expectExit(1);

  run = s.run("--arch", "--version");
  await run.matchErr("pass anything else");
  run.waitSecs(5);
  await run.expectExit(1);

  run = s.run("run", "--version");
  await run.matchErr("pass anything else");
  run.waitSecs(5);
  await run.expectExit(1);

  run = s.run("--arch", "--arch");
  await run.matchErr("more than once");
  run.waitSecs(5);
  await run.expectExit(1);

  // --release takes exactly one value
  run = s.run("--release");
  await run.matchErr("needs a value");
  run.waitSecs(5);
  await run.expectExit(1);

  run = s.run("--release", "abc", "--release", "def");
  await run.matchErr("should only be passed once");
  run.waitSecs(5);
  await run.expectExit(1);

  // required option missing
  run = s.run("dummy");
  await run.matchErr("option is required");
  await run.matchErr("Usage: meteor dummy");
  run.waitSecs(5);
  await run.expectExit(1);

  // successful command invocation, correct parsing of arguments
  run = s.run("dummy", "--ething", "x");
  await run.read('"x" "3000" none []\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  // The tests below fail on Windows. There is a bug in Node about empty
  // arguments that was fixed recently:
  // https://github.com/joyent/node/issues/7138
  if (process.platform !== "win32") {
    run = s.run("dummy", "--ething", "");
    await run.read('"" "3000" none []\n');
    run.waitSecs(5);
    await run.expectEnd();
    await run.expectExit(0);

    run = s.run("dummy", "--ething", "x", "", "");
    await run.read('"x" "3000" none ["",""]\n');
    run.waitSecs(5);
    await run.expectEnd();
    await run.expectExit(0);
  }

  run = s.run("dummy", "--ething=");
  await run.read('"" "3000" none []\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "-e=");
  await run.read('"" "3000" none []\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "--ething", "x", "-");
  await run.read('"x" "3000" none ["-"]\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "-e", "x");
  await run.read('"x" "3000" none []\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  // See comment above about empty arguments
  if (process.platform !== "win32") {
    run = s.run("dummy", "-e", "");
    await run.read('"" "3000" none []\n');
    run.waitSecs(5);
    await run.expectEnd();
    await run.expectExit(0);
  }

  run = s.run("dummy", "-exxx");
  await run.read('"xxx" "3000" none []\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "--ething", "-");
  await run.read('"-" "3000" none []\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "--ething", "x", "--port", "1234", "--changed");
  await run.read('"x" 1234 true []\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "--ething", "x", "--port", "0", "true");
  await run.read('"x" 0 none ["true"]\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "--ething", "x", "--port", "01234", "12", "0013");
  await run.read('"x" 1234 none ["12","0013"]\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "--ething", "--port", "1234", "--changed");
  await run.read('"--port" "3000" true ["1234"]\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "--ething=x=y=z", "-Up=3000");
  await run.read('"x=y=z" 3000 none []\nurl\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  // bad option
  run = s.run("dummy", "--ething", "x", "--foo");
  await run.matchErr("--foo: unknown option");
  await run.expectExit(1);

  run = s.run("dummy", "--ething", "x", "-z");
  await run.matchErr("-z: unknown option");
  await run.expectExit(1);

  // passing short and long options
  run = s.run("dummy", "--ething", "x", "-p", "2000", "--port", "2000");
  await run.matchErr("can't pass both -p and --port");
  await run.expectExit(1);

  // multiple values for an option
  run = s.run("dummy", "--ething", "x", "--port", "2000", "--port", "3000");
  await run.matchErr("can only take one --port option");
  await run.expectExit(1);

  run = s.run("dummy", "--ething", "x", "-p", "2000", "-p", "2000");
  await run.matchErr("can only take one --port (-p) option");
  await run.expectExit(1);

  run = s.run("dummy", "--ething", "x", "--changed", "--changed");
  await run.matchErr("can only take one --changed option");
  await run.expectExit(1);

  // missing option value
  run = s.run("dummy", "--ething", "x", "--port");
  await run.matchErr("the --port option needs a value");
  await run.expectExit(1);

  run = s.run("dummy", "--ething");
  await run.matchErr("--ething option needs a value");
  await run.expectExit(1);

  run = s.run("dummy", "-e");
  await run.matchErr("--ething (-e) option needs a value");
  await run.expectExit(1);

  run = s.run("dummy", "--ething", "x", "--changed", "-p");
  await run.matchErr("the --port (-p) option needs a value");
  await run.expectExit(1);

  // non-numeric value for numeric option
  run = s.run("dummy", "--ething", "x", "--port", "kitten");
  await run.matchErr("--port must be a number");
  await run.expectExit(1);

  run = s.run("dummy", "--ething", "x", "-p", "1234k");
  await run.matchErr("--port (-p) must be a number");
  await run.expectExit(1);

  // bad use of =
  run = s.run("dummy", "--=");
  await run.readErr("Option names cannot begin with '='.\n");
  await run.expectExit(1);

  run = s.run("dummy", "--=asdf");
  await run.readErr("Option names cannot begin with '='.\n");
  await run.expectExit(1);

  run = s.run("dummy", "-=");
  await run.readErr("Option names cannot begin with '='.\n");
  await run.expectExit(1);

  run = s.run("dummy", "-ex", "--changed=foo");
  await run.matchErr("the --changed option does not need a value.\n");
  await run.expectExit(1);

  run = s.run("dummy", "-ex", "-D=foo");
  await run.matchErr("the --delete (-D) option does not need a value.\n");
  await run.expectExit(1);

  run = s.run("dummy", "-ex", "-UD=foo");
  await run.matchErr("the --delete (-D) option does not need a value.\n");
  await run.expectExit(1);

  // incorrect number of arguments
  run = s.run("dummy", "--ething", "x", "1", "2", "3");
  await run.matchErr("too many arguments");
  await run.matchErr("Usage: meteor dummy");
  await run.expectExit(1);

  run = s.run("bundle");
  await run.matchErr("not enough arguments");
  await run.matchErr("This command has been deprecated");
  await run.expectExit(1);

  run = s.run("bundle", "a", "b");
  await run.matchErr("too many arguments");
  await run.matchErr("This command has been deprecated");
  await run.expectExit(1);


  run = s.run("build");
  await run.matchErr("not enough arguments");
  await run.matchErr("Usage: meteor build");
  await run.expectExit(1);

  run = s.run("build", "a", "b");
  await run.matchErr("too many arguments");
  await run.matchErr("Usage: meteor build");
  await run.expectExit(1);

  // '--' to end parsing
  run = s.run("dummy", "--ething", "x", "--", "-p", "4000");
  await run.read('"x" "3000" none ["-p","4000"]\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "--ething", "x", "--", "--changed", "--changed");
  await run.read('"x" "3000" none ["--changed","--changed"]\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "--ething", "x", "--");
  await run.read('"x" "3000" none []\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  // compact short options
  run = s.run("dummy", "--ething", "x", "-p4000", "--changed");
  await run.read('"x" 4000 true []\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "--ething", "x", "-UD", "--changed");
  await run.read('"x" "3000" true []\nurl\n\delete\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "--ething", "x", "-UDp4000", "--changed");
  await run.read('"x" 4000 true []\nurl\ndelete\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "--ething", "x", "-UDp4000", "--changed");
  await run.read('"x" 4000 true []\nurl\ndelete\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "--ething", "x", "-UDp4000");
  await run.read('"x" 4000 none []\nurl\ndelete\n');
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);

  run = s.run("dummy", "--ething", "x", "-UDkp4000", "--changed");
  await run.matchErr("-k: unknown option");
  await run.expectExit(1);

  run = s.run("dummy", "--ething", "x", "-UDp4000k", "--changed");
  await run.matchErr("--port (-p) must be a number");
  await run.expectExit(1);

  run = s.run("dummy", "--ething", "x", "-UD4000k", "--changed");
  await run.matchErr("-4: unknown option");
  await run.expectExit(1);

  run = s.run("dummy", "--ething", "x", "-UDDp4000", "--changed");
  await run.matchErr("one --delete (-D) option");
  await run.expectExit(1);

  // requiring an app dir
  run = s.run("list");
  await run.matchErr("not in a Meteor project");
  await run.matchErr("meteor create"); // new user help
  await run.expectExit(1);

  await s.createApp('myapp', 'standard-app');
  await s.cd('myapp', async function () {
    run = s.run("list");
    run.waitSecs(20);
    await run.expectExit(0);
  });

  await s.cd('myapp', async function () {
    run = s.run("list", "--tree");
    run.waitSecs(20);
    await run.match("├─┬")
    await run.match("│ ├─┬")
    await run.expectExit(0);
  })

  await s.cd('myapp', async function () {
    run = s.run("list", "--json");
    run.waitSecs(20);
    await run.match(/[{}"a-zA-Z0-9,\s\n\r:_.()\[\]]+/)
    await run.expectExit(0);
  })

  await s.createApp("app-with-extra-packages", "extra-packages-option", {
    dontPrepareApp: true
  });
  await s.cd("app-with-extra-packages", async function () {
    run = s.run("--extra-packages", "extra-package-1, extra-package-2@=0.0.2");
    run.waitSecs(60);
    await run.match("extra-package-1: foobar");
    await run.match("extra-package-2: barfoo");
    await run.stop();
  });

  // FIXME: Fibers - Need to make a new release of tmeasday:acceptance-test-driver
  // await s.createApp("app-with-extra-packages", "extra-packages-option", {
  //   dontPrepareApp: true
  // });
  // await s.cd("app-with-extra-packages", async function () {
  //   run = s.run("test",
  //     "--extra-packages", "tmeasday:acceptance-test-driver, extra-package-1, extra-package-2@=0.0.2",
  //     "--driver-package", "tmeasday:acceptance-test-driver");
  //   run.waitSecs(60);
  //   await run.match("extra-package-1: foobar");
  //   await run.match("extra-package-2: barfoo");
  //   await run.stop();
  // });

  await s.createApp("app-with-extra-packages", "extra-packages-option", {
    dontPrepareApp: true
  });
  await s.cd("app-with-extra-packages", async function () {
    run = s.run("test-packages", "--once",
      "--driver-package", "test-server-tests-in-console-once",
      "--extra-packages", "extra-package-1, extra-package-2@=0.0.2",
      "extra-package-1", "extra-package-2");
    run.waitSecs(60);
    await run.match("extra-package-1 - example test");
    await run.match("extra-package-2 - example test");
    await run.expectExit(0);
  });
});


selftest.define("command-like options", async function () {
  var s = new Sandbox;
  await s.init();
  var run;

  run = s.run("--version");
  if (release.current.isCheckout()) {
    await run.matchErr("Unreleased");
    await run.expectExit(1);
  } else {
    await run.read(release.current.getDisplayName() + "\n");
    run.waitSecs(5);
    await run.expectEnd();
    await run.expectExit(0);
  }

  run = s.run("--arch");
  await run.read(archinfo.host() + "\n");
  run.waitSecs(5);
  await run.expectEnd();
  await run.expectExit(0);
});

selftest.define("rails reminders", async function () {
  var s = new Sandbox;
  await s.init();

  var run;

  run = s.run("server");
  await run.matchErr("Did you mean 'meteor run'?");
  await run.expectExit(1);
  run = s.run("console");
  await run.matchErr("Did you mean 'meteor shell'?");
  await run.expectExit(1);
  run = s.run("new");
  await run.matchErr("Did you mean 'meteor create'?");
  await run.expectExit(1);
  run = s.run("dbconsole");
  await run.matchErr("Did you mean 'meteor mongo'?");
  await run.expectExit(1);

  // It should ignore args
  run = s.run("server", "ignoredArg");
  await run.matchErr("Did you mean 'meteor run'?");
  await run.expectExit(1);
  run = s.run("console", "ignoredArg");
  await run.matchErr("Did you mean 'meteor shell'?");
  await run.expectExit(1);
  run = s.run("new", "ignoredArg");
  await run.matchErr("Did you mean 'meteor create'?");
  await run.expectExit(1);
  run = s.run("dbconsole", "ignoredArg");
  await run.matchErr("Did you mean 'meteor mongo'?");
  await run.expectExit(1);
});

selftest.skip.define("old cli tests (converted)", async function () {
  var s = new Sandbox;
  await s.init();

  var run;

  run = s.run("--help");
  await run.match("List the packages explicitly used");
  run = s.run("run", "--help");
  await run.match("Port to listen");
  run = s.run("test-packages", "--help");
  await run.match("Port to listen");
  run = s.run("create", "--help");
  await run.match("Make a subdirectory");
  run = s.run("update", "--help");
  await run.match("Updates the meteor release");
  run = s.run("add", "--help");
  await run.match("Adds packages");
  run = s.run("remove", "--help");
  await run.match("Removes a package");
  run = s.run("list", "--help");
  await run.match("Transitive dependencies are not listed unless");
  run = s.run("bundle", "--help");
  await run.match("command has been deprecated");
  run = s.run("build", "--help");
  await run.match("Package this project");
  run = s.run("mongo", "--help");
  await run.match("Opens a Mongo");
  run = s.run("deploy", "--help");
  await run.match("Deploys the project");
  run = s.run("logs", "--help");
  await run.match("Retrieves the");
  run = s.run("reset", "--help");
  await run.match("Reset the current");
  run = s.run("test-packages", "--help");
  await run.match("Runs unit tests");

  run = s.run();
  await run.matchErr("run: You're not in");
  await run.expectExit(1);
  run = s.run("run");
  await run.matchErr("run: You're not in");
  await run.expectExit(1);
  run = s.run("add", "foo");
  await run.matchErr("add: You're not in");
  await run.expectExit(1);
  run = s.run("remove", "foo");
  await run.matchErr("remove: You're not in");
  await run.expectExit(1);
  run = s.run("list");
  await run.matchErr("list: You're not in");
  await run.expectExit(1);
  run = s.run("bundle", "foo.tar.gz");
  await run.matchErr("bundle: You're not in");
  await run.expectExit(1);
  run = s.run("build", "foo.tar.gz");
  await run.matchErr("build: You're not in");
  await run.expectExit(1);
  run = s.run("mongo");
  await run.matchErr("mongo: You're not in");
  await run.expectExit(1);
  run = s.run("deploy", "automated-test");
  await run.matchErr("deploy: You're not in");
  await run.expectExit(1);
  run = s.run("reset");
  await run.matchErr("reset: You're not in");
  await run.expectExit(1);

  var dir = "skel with spaces";
  run = s.run("create", dir);
  await run.expectExit(0);

  selftest.expectTrue(files.stat(files.pathJoin(s.home, dir)).isDirectory());

  s.cd(dir);

  // add/remove/list
  run = s.run('search', 'backbone');
  await run.match('backbone');

  run = s.run('list');
  await run.expectExit(0);
  run.forbid('backbone');

  run = s.run('add', 'backbone');
  await run.match('backbone:');
  await run.expectExit(0);
  run.forbidErr('no such package');

  run = s.run('list');
  await run.match('backbone');

  selftest.expectTrue(files.readFile(files.pathJoin(s.cwd, '.meteor', 'packages'), 'utf8').match(/backbone/));

  // bundle
  run = s.run('bundle', 'foo.tar.gz');
  await run.matchErr(/This command has been deprecated/);

  run = s.run('build', '.');
  await run.expectExit(0);

  if (process.platform !== 'win32') {
    tar_tvzf = utils.execFileSync('tar', ['tvzf', files.pathJoin(s.cwd, dir + '.tar.gz')]);
    selftest.expectTrue(tar_tvzf.success);
  }
  files.unlink(files.pathJoin(s.cwd, dir + '.tar.gz'));

  // test-packages
  var dieNow = files.pathJoin(s.home, 'local-packages', 'die-now');
  files.mkdir_p(dieNow);
  files.writeFile(files.pathJoin(dieNow, 'package.js'), [
'Package.describe({',
'  summary: "die-now",',
'  version: "1.0.0"',
'});',
'Package.onTest(function (api) {',
'  api.use("deps"); // try to use a core package',
'  api.addFiles(["die-now.js"], "server");',
'});'
  ].join('\n'));
  files.writeFile(files.pathJoin(dieNow, 'die-now.js'), [
'if (Meteor.isServer) {',
'  console.log("Dying");',
'  process.exit(0);',
'}'
  ].join('\n'));

  var port = 9100;
  run = s.run('test-packages', '--once', '-p', port, dieNow);
  await run.match('Dying');
  // since the server process was killed via 'process.exit', mongo is still running.
  // the second argument is a dummy since it is hard to know the dbpath of mongo
  // running for a test-runner
  runMongo.findMongoAndKillItDead(port + 1, s.cwd);
  utils.sleepMs(2000);


  // settings
  files.writeFile(files.pathJoin(s.cwd, 'settings.json'), JSON.stringify({ foo: "bar", baz: "quux" }));
  files.writeFile(files.pathJoin(s.cwd, 'settings.js'), [
'if (Meteor.isServer) {',
'  Meteor.startup(function () {',
'    if (!Meteor.settings) process.exit(1);',
'    if (Meteor.settings.foo !== "bar") process.exit(1);',
'    process.exit(0);',
'  });',
'}'
  ].join('\n'));

  run = s.run('-p', port, '--settings', 'settings.json', '--once');
  await run.expectExit(0);
  files.unlink(files.pathJoin(s.cwd, 'settings.js'));
});

// Added to address https://github.com/meteor/meteor/issues/8897.
selftest.define(
  'meteor test-packages --test-app-path directory',
  async function () {
    var s = new Sandbox();
    await s.init();

    var run;

    // If test-app-path doesn't exist, it should be created.
    var testAppPath = '/tmp/meteor_test_app_path';
    await files.rm_recursive(testAppPath);
    selftest.expectFalse(files.exists(testAppPath));
    await s.createApp('test-app-path-app', 'package-tests', {
      dontPrepareApp: true
    });
    await s.cd('test-app-path-app/packages/say-something', async function () {
      run = s.run(
        'test-packages',
        '--once',
        { 'test-app-path': testAppPath },
        './'
      );
      await run.match('Started');
      selftest.expectTrue(files.exists(testAppPath));
      await run.stop();
      await files.rm_recursive(testAppPath);
    });

    // If test-app-path already exists, make sure that directory is used.
    var testAppPath = '/tmp/meteor_test_app_path';
    await files.rm_recursive(testAppPath);
    files.mkdir_p(testAppPath);
    selftest.expectTrue(files.exists(testAppPath));
    selftest.expectFalse(files.exists(testAppPath + '/.meteor'));
    await s.createApp('test-app-path-app', 'package-tests', {
      dontPrepareApp: true
    });
    await s.cd('test-app-path-app/packages/say-something', async function () {
      run = s.run(
        'test-packages',
        '--once',
        { 'test-app-path': testAppPath },
        './'
      );
      await run.match('Started');
      selftest.expectTrue(files.exists(testAppPath + '/.meteor'));
      await run.stop();
      await files.rm_recursive(testAppPath);
    });

    // If test-app-path already exists but is a file instead of a directory,
    // show a console error message explaining this, and exit.
    var testAppPath = '/tmp/meteor_test_app_path';
    await files.rm_recursive(testAppPath);
    files.writeFile(testAppPath, '<3 meteor');
    selftest.expectTrue(files.exists(testAppPath));
    await s.createApp('test-app-path-app', 'package-tests', {
      dontPrepareApp: true
    });
    await s.cd('test-app-path-app/packages/say-something', async function () {
      run = s.run(
        'test-packages',
        '--once',
        { 'test-app-path': testAppPath },
        './'
      );
      await run.matchErr('is not a directory');
      await run.expectExit(1);
      await files.rm_recursive(testAppPath);
    });
  }
);
