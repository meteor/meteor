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

